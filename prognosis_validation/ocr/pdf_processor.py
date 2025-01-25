import os
import logging
from pathlib import Path
from typing import Dict, List, Optional
import pytesseract
from pdf2image import convert_from_path
import numpy as np
from dataclasses import dataclass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class MedicalSection:
    """Represents a logical section in a medical document"""
    title: str
    content: str
    page_num: int
    bbox: tuple  # x1, y1, x2, y2 coordinates

class MedicalDocumentProcessor:
    """Handles OCR and initial processing of medical documents"""
    
    def __init__(self, output_dir: str = 'processed_docs'):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
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
        """Process a medical PDF document and extract structured sections"""
        logger.info(f"Processing PDF: {pdf_path}")
        sections = []
        
        try:
            # Convert PDF to images
            images = convert_from_path(pdf_path)
            
            for page_num, image in enumerate(images, 1):
                # Convert to numpy array for processing
                image_np = np.array(image)
                
                # Perform OCR with layout analysis
                ocr_data = pytesseract.image_to_data(
                    image_np, 
                    output_type=pytesseract.Output.DICT,
                    config='--psm 3'  # Fully automatic page segmentation
                )
                
                # Process the OCR data into sections
                page_sections = self._extract_sections(ocr_data, page_num)
                sections.extend(page_sections)
                
                logger.info(f"Processed page {page_num}: Found {len(page_sections)} sections")
                
        except Exception as e:
            logger.error(f"Error processing PDF {pdf_path}: {e}")
            raise
            
        return sections
    
    def _extract_sections(self, ocr_data: Dict, page_num: int) -> List[MedicalSection]:
        """Extract logical sections from OCR data"""
        sections = []
        current_section = None
        current_text = []
        
        # Group text into logical blocks
        for i, text in enumerate(ocr_data['text']):
            if not text.strip():
                continue
                
            # Check if this is a section header
            section_type = self._identify_section_type(text)
            
            if section_type:
                # Save previous section if it exists
                if current_section and current_text:
                    sections.append(MedicalSection(
                        title=current_section,
                        content=' '.join(current_text),
                        page_num=page_num,
                        bbox=self._get_text_bbox(ocr_data, i)
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
                bbox=self._get_text_bbox(ocr_data, len(ocr_data['text']) - 1)
            ))
        
        return sections
    
    def _identify_section_type(self, text: str) -> Optional[str]:
        """Identify if text is a section header"""
        text = text.lower().strip()
        for section_type, markers in self.section_markers.items():
            if any(marker.lower() in text for marker in markers):
                return section_type
        return None
    
    def _get_text_bbox(self, ocr_data: Dict, index: int) -> tuple:
        """Get bounding box coordinates for text"""
        return (
            ocr_data['left'][index],
            ocr_data['top'][index],
            ocr_data['left'][index] + ocr_data['width'][index],
            ocr_data['top'][index] + ocr_data['height'][index]
        )