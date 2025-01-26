import os
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import defaultdict
import pytesseract
from pdf2image import convert_from_path
import numpy as np
import cv2
from dataclasses import dataclass
from concurrent.futures import ProcessPoolExecutor, as_completed
from functools import partial

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class MedicalSection:
    """Represents a logical section in a medical document"""
    title: str
    content: str
    page_num: int
    bbox: Tuple[int, int, int, int]  # x1, y1, x2, y2 coordinates

def remove_watermark(image: np.ndarray) -> np.ndarray:
    """
    Remove purple watermarks from the image using HSV color filtering.
    Args:
        image: Input image as a numpy array
    Returns:
        Processed grayscale image with watermarks removed
    """
    # Convert to HSV color space
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    
    # Define purple range (adjust based on exact hue)
    lower_purple = np.array([120, 40, 40])  # Hue: 120-160 (purple range)
    upper_purple = np.array([160, 255, 255])
    
    # Create mask for purple regions
    mask = cv2.inRange(hsv, lower_purple, upper_purple)
    
    # Invert mask to keep non-purple regions
    inverted_mask = cv2.bitwise_not(mask)
    
    # Apply mask to original image
    result = cv2.bitwise_and(image, image, mask=inverted_mask)
    
    # Convert to grayscale and enhance contrast
    gray = cv2.cvtColor(result, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    return thresh

def process_single_page(page_data, section_markers):
    """Process a single page with watermark removal and OCR"""
    page_num, image = page_data
    
    # Convert PIL image to numpy array
    image_np = np.array(image)
    
    # Step 1: Remove watermark
    processed_image = remove_watermark(image_np)
    
    # Step 2: Perform OCR on the processed image
    ocr_data = pytesseract.image_to_data(
        processed_image,
        output_type=pytesseract.Output.DICT,
        config='--oem 1 --psm 4'  # LSTM engine + single column mode
    )
    
    # Step 3: Extract sections
    sections = extract_sections(ocr_data, page_num, section_markers)
    
    return page_num, sections

def extract_sections(ocr_data: Dict, page_num: int, section_markers: Dict) -> List[MedicalSection]:
    """Extract logical sections from OCR data"""
    sections = []
    current_section = None
    current_text = []
    
    for i, text in enumerate(ocr_data['text']):
        if not text.strip():
            continue
            
        # Check if this is a section header
        section_type = identify_section_type(text, section_markers)
        
        if section_type:
            # Save previous section if it exists
            if current_section and current_text:
                sections.append(MedicalSection(
                    title=current_section,
                    content=' '.join(current_text),
                    page_num=page_num,
                    bbox=get_text_bbox(ocr_data, i)
                ))
            
            # Start new section
            current_section = section_type
            current_text = []
        else:
            current_text.append(text)
    
    # Don't forget the last section
    if current_section and current_text:
        sections.append(MedicalSection(
            title=current_section,
            content=' '.join(current_text),
            page_num=page_num,
            bbox=get_text_bbox(ocr_data, len(ocr_data['text']) - 1)
        ))
    
    return sections

def identify_section_type(text: str, section_markers: Dict) -> Optional[str]:
    """Identify if text is a section header"""
    text = text.lower().strip()
    for section_type, markers in section_markers.items():
        if any(marker.lower() in text for marker in markers):
            return section_type
    return None

def get_text_bbox(ocr_data: Dict, index: int) -> Tuple[int, int, int, int]:
    """Get bounding box coordinates for text"""
    return (
        ocr_data['left'][index],
        ocr_data['top'][index],
        ocr_data['left'][index] + ocr_data['width'][index],
        ocr_data['top'][index] + ocr_data['height'][index]
    )

class ParallelMedicalDocumentProcessor:
    """Handles OCR and initial processing of medical documents with parallel processing"""
    
    def __init__(self, output_dir: str = 'processed_docs', max_workers: int = None):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.max_workers = max_workers or os.cpu_count()
        
        # Medical document section markers
        self.section_markers = {
            'patient_info': ['Patient Name', 'DOB:', 'Date of Birth'],
            'history': ['Prior injury details', 'Medical History', 'Past Medical History'],
            'symptoms': ['Current Symptoms', 'Chief Complaint', 'Present Illness'],
            'diagnosis': ['Diagnosis', 'Assessment', 'Clinical Impression'],
            'treatment': ['Treatment', 'Plan', 'Recommendations', 'Medications'],
            'procedures': ['Procedure', 'Surgery', 'Intervention'],
            'vitals': ['Vital Signs', 'Blood Pressure', 'Temperature'],
            'labs': ['Laboratory', 'Lab Results', 'Test Results'],
            'imaging': ['Imaging', 'X-ray', 'MRI', 'CT Scan'],
        }

    def process_pdf(self, pdf_path: str) -> List[MedicalSection]:
        """Process a medical PDF document and extract structured sections in parallel"""
        logger.info(f"Processing PDF: {pdf_path}")
        
        try:
            # Convert PDF to images
            images = convert_from_path(pdf_path)
            
            # Create page data tuples (page_num, image)
            page_data = [(i+1, img) for i, img in enumerate(images)]
            
            # Process pages in parallel
            all_sections = []
            process_func = partial(process_single_page, section_markers=self.section_markers)
            
            with ProcessPoolExecutor(max_workers=self.max_workers) as executor:
                # Submit all pages for processing
                future_to_page = {
                    executor.submit(process_func, pd): pd[0] 
                    for pd in page_data
                }
                
                # Collect results as they complete
                page_sections = {}
                for future in as_completed(future_to_page):
                    page_num = future_to_page[future]
                    try:
                        _, sections = future.result()
                        page_sections[page_num] = sections
                    except Exception as e:
                        logger.error(f"Error processing page {page_num}: {e}")
                        continue
                
                # Combine sections in page order
                for page_num in sorted(page_sections.keys()):
                    all_sections.extend(page_sections[page_num])
                    logger.info(f"Processed page {page_num}: Found {len(page_sections[page_num])} sections")
            
            return all_sections
            
        except Exception as e:
            logger.error(f"Error processing PDF {pdf_path}: {e}")
            raise