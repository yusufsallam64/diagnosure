import os
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import defaultdict
import pytesseract
from pdf2image import convert_from_path
import numpy as np
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

def process_single_page(page_data, section_markers):
    """Process a single page in parallel with enhanced OCR"""
    page_num, image = page_data
    
    # Convert to grayscale for better OCR
    image_np = np.array(image.convert('L'))
    
    # Enhanced OCR configuration
    ocr_data = pytesseract.image_to_data(
        image_np,
        output_type=pytesseract.Output.DICT,
        config='--oem 1 --psm 4'  # LSTM engine + single column mode
    )
    
    # Extract sections and tables
    sections = extract_sections(ocr_data, page_num, section_markers, image)
    return page_num, sections

def detect_tables(ocr_data: Dict) -> List[List[List[str]]]:
    """Detect tabular structures using text coordinates"""
    rows = defaultdict(list)
    for i in range(len(ocr_data['text'])):
        if not ocr_data['text'][i].strip():
            continue
        y = ocr_data['top'][i]
        rows[y].append({
            'x': ocr_data['left'][i],
            'text': ocr_data['text'][i],
            'width': ocr_data['width'][i]
        })

    sorted_rows = sorted(rows.items(), key=lambda x: x[0])
    table = []
    for y, items in sorted_rows:
        sorted_items = sorted(items, key=lambda x: x['x'])
        table.append([item['text'] for item in sorted_items])

    return [table] if len(table) > 1 and len(table[0]) > 1 else []

def extract_sections(ocr_data: Dict, page_num: int, section_markers: Dict, image) -> List[MedicalSection]:
    """Extract logical sections and tables from OCR data"""
    sections = []
    
    # Process tables first
    tables = detect_tables(ocr_data)
    for table in tables:
        table_content = "\n".join(["|".join(row) for row in table])
        sections.append(MedicalSection(
            title="table",
            content=table_content,
            page_num=page_num,
            bbox=(0, 0, image.width, image.height)
        ))

    current_section = None
    current_text = []
    
    for i, text in enumerate(ocr_data['text']):
        if not text.strip():
            continue
            
        # Enhanced header detection
        is_bold = ocr_data['conf'][i] > 90
        section_type = identify_section_type(text, section_markers, is_bold)
        
        if section_type:
            if current_section and current_text:
                sections.append(MedicalSection(
                    title=current_section,
                    content=' '.join(current_text),
                    page_num=page_num,
                    bbox=get_text_bbox(ocr_data, i)
                ))
            current_section = section_type
            current_text = []
        else:
            current_text.append(text)
    
    if current_section and current_text:
        sections.append(MedicalSection(
            title=current_section,
            content=' '.join(current_text),
            page_num=page_num,
            bbox=get_text_bbox(ocr_data, len(ocr_data['text']) - 1)
        ))
    
    return sections

def identify_section_type(text: str, section_markers: Dict, is_bold: bool) -> Optional[str]:
    """Identify section headers with formatting cues"""
    text_clean = text.strip().lower()
    
    for section_type, markers in section_markers.items():
        if any(m.lower() in text_clean for m in markers):
            return section_type
    
    if is_bold or text_clean.endswith(':'):
        return 'generic_header'
    
    if text.isupper() and len(text) > 3:
        return 'generic_header'
    
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
    """Enhanced medical document processor with table detection"""
    
    def __init__(self, output_dir: str = 'processed_docs', max_workers: int = None):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.max_workers = max_workers or os.cpu_count()
        
        self.section_markers = {
            'patient_info': ['Patient Name', 'MRN:', 'DOB:', 'Gender'],
            'history': ['Medical History', 'Surgical History', 'Family History'],
            'assessment': ['Assessment', 'Clinical Impression', 'Differential Diagnosis'],
            'plan': ['Treatment Plan', 'Follow Up', 'Discharge Plan'],
            'medications': ['Active Medications', 'Discharge Medications'],
            'allergies': ['Allergies', 'Drug Allergies'],
            'vitals': ['Vital Signs', 'BMI:', 'Blood Pressure'],
            'labs': ['Lab Results', 'CBC', 'Metabolic Panel'],
            'imaging': ['Radiology', 'CT Scan', 'X-ray Findings'],
            'procedures': ['Procedures', 'Operative Note', 'Surgical Report']
        }

    def process_pdf(self, pdf_path: str) -> List[MedicalSection]:
        """Process PDF with enhanced OCR and structure detection"""
        logger.info(f"Processing PDF: {pdf_path}")
        try:
            images = convert_from_path(pdf_path)
            page_data = [(i+1, img) for i, img in enumerate(images)]
            
            all_sections = []
            process_func = partial(process_single_page, section_markers=self.section_markers)
            
            with ProcessPoolExecutor(max_workers=self.max_workers) as executor:
                future_to_page = {
                    executor.submit(process_func, pd): pd[0] 
                    for pd in page_data
                }
                
                page_sections = {}
                for future in as_completed(future_to_page):
                    page_num = future_to_page[future]
                    try:
                        _, sections = future.result()
                        page_sections[page_num] = sections
                    except Exception as e:
                        logger.error(f"Error processing page {page_num}: {e}")
                        continue
                
                for page_num in sorted(page_sections.keys()):
                    all_sections.extend(page_sections[page_num])
                    logger.info(f"Processed page {page_num}: Found {len(page_sections[page_num])} sections")
            
            return all_sections
            
        except Exception as e:
            logger.error(f"Error processing PDF {pdf_path}: {e}")
            raise