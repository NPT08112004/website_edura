# app/services/ai_service.py

from google import genai
from google.genai.errors import APIError
import pdfplumber  # <-- THƯ VIỆN MỚI: Dùng để trích xuất text từ PDF
import os
from dotenv import load_dotenv
from docx import Document
from collections import Counter

load_dotenv()

# Lấy Key từ biến môi trường
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Tên mô hình bạn muốn sử dụng
MODEL_NAME = "gemini-2.5-flash" 

class AIService:
    """Class dịch vụ để tương tác với Gemini API."""
    def __init__(self):
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY chưa được cấu hình trong .env")
        
        # Khởi tạo client
        self.client = genai.Client(api_key=GEMINI_API_KEY)

    # ----------------------------------------------------
    # HÀM MỚI: Khắc phục lỗi AttributeError
    # ----------------------------------------------------
    def extract_text_from_pdf_stream(self, file_stream):
        """Trích xuất toàn bộ văn bản từ luồng file PDF."""
        try:
            # pdfplumber có thể đọc trực tiếp từ luồng byte
            with pdfplumber.open(file_stream) as pdf:
                # Trích xuất văn bản từ tất cả các trang
                full_text = "".join([page.extract_text() + "\n" for page in pdf.pages if page.extract_text()])
                return full_text
        except Exception as e:
            print(f"Lỗi khi trích xuất văn bản từ PDF (pdfplumber): {e}")
            return None
    
    def extract_and_summarize_from_pdf_images(self, pdf_bytes: bytes, max_pages: int = 10, page_count: int = None):
        """
        Sử dụng Gemini Vision API để OCR và tóm tắt trực tiếp từ hình ảnh PDF.
        Dùng cho PDF scan không có text layer.
        """
        try:
            import fitz  # PyMuPDF
            from io import BytesIO
            from PIL import Image
            
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            total_pages = doc.page_count
            pages_to_process = min(max_pages, total_pages)
            
            print(f"[Gemini Vision] Xử lý {pages_to_process}/{total_pages} trang đầu tiên bằng Gemini Vision API...")
            
            # Lấy hình ảnh từ các trang đầu tiên
            page_images = []
            for i in range(pages_to_process):
                try:
                    page = doc.load_page(i)
                    pix = page.get_pixmap(alpha=False, matrix=fitz.Matrix(2.0, 2.0))  # Scale 2x cho chất lượng tốt hơn
                    if pix.alpha:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    page_images.append(img)
                except Exception as e:
                    print(f"[Gemini Vision] Lỗi khi render trang {i}: {e}")
                    continue
            
            doc.close()
            
            if not page_images:
                print(f"[Gemini Vision] Không render được hình ảnh nào")
                return None, None
            
            # Gửi hình ảnh đến Gemini Vision API để OCR và tóm tắt
            print(f"[Gemini Vision] Gửi {len(page_images)} hình ảnh đến Gemini Vision API...")
            
            # Chuyển đổi hình ảnh thành base64
            import base64
            from io import BytesIO as BIO
            
            image_parts = []
            for i, img in enumerate(page_images[:5]):  # Giới hạn 5 trang để tránh quá tải
                try:
                    buf = BIO()
                    img.save(buf, format='PNG')
                    img_bytes = buf.getvalue()
                    # Lưu cả bytes và base64 string để có thể dùng cả hai cách
                    image_parts.append({
                        "mime_type": "image/png",
                        "data_bytes": img_bytes,  # Bytes gốc
                        "data_base64": base64.b64encode(img_bytes).decode('utf-8')  # Base64 string
                    })
                except Exception as e:
                    print(f"[Gemini Vision] Lỗi khi encode hình ảnh {i}: {e}")
                    continue
            
            if not image_parts:
                return None, None
            
            # Tạo prompt cho Gemini Vision
            is_long_doc = page_count is not None and page_count > 100
            if is_long_doc:
                prompt_text = (
                    "Bạn là một chuyên gia tóm tắt tài liệu học thuật. "
                    "Dưới đây là các hình ảnh từ một tài liệu RẤT DÀI (trên 100 trang). "
                    "Hãy thực hiện hai việc:\n"
                    "1. OCR và trích xuất TOÀN BỘ văn bản từ các hình ảnh này\n"
                    "2. Tạo một TÓM TẮT CHI TIẾT (15-20 câu, bằng tiếng Việt) theo CÁC Ý CHÍNH:\n"
                    "   • Mục đích và phạm vi của tài liệu\n"
                    "   • Nội dung chính được trình bày\n"
                    "   • Các khái niệm, phương pháp quan trọng\n"
                    "   • Kết luận hoặc điểm quan trọng\n"
                    "3. Liệt kê 15-20 Từ khóa quan trọng nhất, tách nhau bằng dấu phẩy\n\n"
                    "TRẢ VỀ KẾT QUẢ THEO ĐỊNH DẠNG:\n"
                    "Tóm tắt: [Nội dung tóm tắt chi tiết]\n"
                    "Từ khóa: [Từ khóa 1], [Từ khóa 2], [Từ khóa 3]..."
                )
            else:
                prompt_text = (
                    "Bạn là một chuyên gia tóm tắt tài liệu học thuật. "
                    "Dưới đây là các hình ảnh từ một tài liệu. "
                    "Hãy thực hiện hai việc:\n"
                    "1. OCR và trích xuất TOÀN BỘ văn bản từ các hình ảnh này\n"
                    "2. Tạo một TÓM TẮT CHI TIẾT (10-15 câu, bằng tiếng Việt) theo CÁC Ý CHÍNH\n"
                    "3. Liệt kê 12-15 Từ khóa quan trọng nhất, tách nhau bằng dấu phẩy\n\n"
                    "TRẢ VỀ KẾT QUẢ THEO ĐỊNH DẠNG:\n"
                    "Tóm tắt: [Nội dung tóm tắt chi tiết]\n"
                    "Từ khóa: [Từ khóa 1], [Từ khóa 2], [Từ khóa 3]..."
                )
            
            # Gửi request đến Gemini Vision API
            try:
                # Tạo contents với text và images
                # Thử nhiều cách để tương thích với API
                from google.genai import types
                
                # Tạo list parts với text và images
                parts = []
                parts.append(prompt_text)  # Text prompt
                
                for img_part in image_parts:
                    try:
                        # Cách 1: Thử sử dụng Blob với data là bytes
                        try:
                            blob = types.Blob(
                                data=img_part["data_bytes"],  # Bytes gốc
                                mime_type=img_part["mime_type"]
                            )
                            part_obj = types.Part(inline_data=blob)
                            parts.append(part_obj)
                            continue
                        except Exception as e1:
                            print(f"[Gemini Vision] Cách 1 (Blob với bytes) thất bại: {e1}")
                        
                        # Cách 2: Thử sử dụng Blob với data là base64 string
                        try:
                            blob = types.Blob(
                                data=img_part["data_base64"],  # Base64 string
                                mime_type=img_part["mime_type"]
                            )
                            part_obj = types.Part(inline_data=blob)
                            parts.append(part_obj)
                            continue
                        except Exception as e2:
                            print(f"[Gemini Vision] Cách 2 (Blob với base64) thất bại: {e2}")
                        
                        # Cách 3: Thử dict trực tiếp
                        try:
                            part_dict = {
                                "inline_data": {
                                    "mime_type": img_part["mime_type"],
                                    "data": img_part["data_base64"]  # Base64 string
                                }
                            }
                            parts.append(part_dict)
                            continue
                        except Exception as e3:
                            print(f"[Gemini Vision] Cách 3 (dict) thất bại: {e3}")
                            
                    except Exception as e:
                        print(f"[Gemini Vision] Lỗi khi tạo part cho hình ảnh: {e}")
                        continue
                
                if len(parts) <= 1:  # Chỉ có prompt, không có hình ảnh
                    print(f"[Gemini Vision] Không tạo được part nào cho hình ảnh")
                    return None, None
                
                print(f"[Gemini Vision] Gửi {len(parts)-1} hình ảnh với prompt text đến API...")
                
                # Truyền parts trực tiếp
                response = self.client.models.generate_content(
                    model=MODEL_NAME,
                    contents=parts,
                    config={
                        "system_instruction": (
                            "Bạn là một chuyên gia OCR và tóm tắt tài liệu. "
                            "Nhiệm vụ của bạn là đọc văn bản từ hình ảnh và tạo tóm tắt chi tiết, toàn diện."
                        ),
                        "temperature": 0.3,
                    }
                )
                
                result_text = response.text.strip()
                print(f"[Gemini Vision] Nhận được response: {len(result_text)} ký tự")
                
                # Phân tích kết quả
                if "Tóm tắt:" in result_text and "Từ khóa:" in result_text:
                    summary_part = result_text.split("Tóm tắt:")[1].split("Từ khóa:")[0].strip()
                    keywords_str = result_text.split("Từ khóa:")[1].strip()
                    keywords = [k.strip() for k in keywords_str.split(',') if k.strip()]
                    print(f"[Gemini Vision] Tóm tắt thành công: {len(summary_part)} ký tự, {len(keywords)} từ khóa")
                    return summary_part, keywords
                elif "Tóm tắt:" in result_text:
                    summary_part = result_text.split("Tóm tắt:")[1].strip()
                    keywords = []
                    return summary_part, keywords
                else:
                    # Fallback: lấy toàn bộ làm summary
                    return result_text, []
                    
            except APIError as e:
                print(f"[Gemini Vision] Lỗi Gemini API: {e}")
                return None, None
            except Exception as e:
                print(f"[Gemini Vision] Lỗi khi gọi Gemini Vision: {e}")
                import traceback
                traceback.print_exc()
                return None, None
                
        except Exception as e:
            print(f"[Gemini Vision] Lỗi khi xử lý PDF: {e}")
            import traceback
            traceback.print_exc()
            return None, None
            
    # ----------------------------------------------------
    # HÀM ĐÃ SỬA: Trả về Tuple (summary, keywords)
    # ----------------------------------------------------
    def summarize_content(self, document_text: str, page_count: int = None):
        """Sử dụng Gemini để tóm tắt văn bản và trích xuất keywords."""
        
        if not document_text or len(document_text.strip()) == 0:
            return None, None
        
        # Xử lý tài liệu dài: chia nhỏ và tóm tắt từng phần
        max_chunk_size = 50000  # Tăng lên 50k ký tự để xử lý tài liệu dài hơn
        text_length = len(document_text)
        
        # Phát hiện tài liệu dài: sử dụng page_count nếu có, nếu không thì dùng text_length
        if page_count is not None:
            is_long_document = page_count > 100  # Giảm ngưỡng xuống 100 trang
        else:
            # Ước tính: > 100 trang nếu text > 60k ký tự (khoảng 500-600 ký tự/trang)
            is_long_document = text_length > 60000
        
        if text_length <= max_chunk_size:
            # Tài liệu ngắn: tóm tắt trực tiếp
            return self._summarize_single_chunk(document_text, is_long_doc=is_long_document)
        else:
            # Tài liệu dài: chia nhỏ và tóm tắt từng phần, sau đó tổng hợp
            return self._summarize_long_document(document_text, max_chunk_size, is_long_doc=is_long_document)
    
    def _summarize_single_chunk(self, text: str, is_long_doc: bool = False):
        """Tóm tắt một đoạn text ngắn."""
        # Giới hạn nội dung gửi đi (tránh lỗi token dài)
        max_single_chunk = 50000 if is_long_doc else 30000  # Tăng cho tài liệu dài
        content_to_send = text[:max_single_chunk] if len(text) > max_single_chunk else text
        
        # Prompt chi tiết hơn cho tài liệu dài
        if is_long_doc:
            prompt = (
                "Bạn là một chuyên gia tóm tắt tài liệu học thuật và chuyên nghiệp. "
                "Nhiệm vụ của bạn là phân tích TOÀN BỘ nội dung văn bản dưới đây và tạo một tóm tắt CHI TIẾT theo CÁC Ý CHÍNH.\n\n"
                "YÊU CẦU TÓM TẮT:\n"
                "1. Đọc kỹ và phân tích TOÀN BỘ nội dung được cung cấp\n"
                "2. Xác định và liệt kê CÁC Ý CHÍNH của tài liệu\n"
                "3. Viết một TÓM TẮT CHI TIẾT (15-25 câu, bằng tiếng Việt) được tổ chức theo CÁC Ý CHÍNH sau:\n"
                "   • Mục đích và phạm vi: Mục đích, phạm vi và đối tượng của tài liệu\n"
                "   • Nội dung chính: Các chủ đề, khái niệm và lý thuyết chính được trình bày\n"
                "   • Phương pháp và kỹ thuật: Các phương pháp, quy trình hoặc kỹ thuật được đề cập (nếu có)\n"
                "   • Ví dụ và minh họa: Các ví dụ, minh họa hoặc case study quan trọng (nếu có)\n"
                "   • Kết quả và kết luận: Kết quả, kết luận hoặc đánh giá chính\n"
                "   • Ứng dụng: Ứng dụng thực tế hoặc ý nghĩa của nội dung\n"
                "4. Mỗi ý chính phải được trình bày rõ ràng, chi tiết và đầy đủ\n"
                "5. Đảm bảo tóm tắt phản ánh ĐẦY ĐỦ tất cả các ý chính, không bỏ sót nội dung quan trọng\n"
                "6. Sử dụng ngôn ngữ rõ ràng, chính xác và dễ hiểu\n"
                "7. Liệt kê 15-20 Từ khóa quan trọng nhất (bao gồm thuật ngữ chuyên ngành, khái niệm chính), tách nhau bằng dấu phẩy\n\n"
                "TRẢ VỀ KẾT QUẢ THEO ĐỊNH DẠNG DUY NHẤT SAU:\n"
                "Tóm tắt: [Nội dung tóm tắt chi tiết theo các ý chính, mỗi ý được trình bày rõ ràng]\n"
                "Từ khóa: [Từ khóa 1], [Từ khóa 2], [Từ khóa 3]...\n\n"
                f"TOÀN BỘ NỘI DUNG TÀI LIỆU CẦN TÓM TẮT:\n{content_to_send}"
            )
        else:
            prompt = (
                "Bạn là một chuyên gia tóm tắt tài liệu học thuật và chuyên nghiệp. "
                "Nhiệm vụ của bạn là phân tích TOÀN BỘ nội dung văn bản dưới đây và tạo một tóm tắt CHI TIẾT theo CÁC Ý CHÍNH.\n\n"
                "YÊU CẦU TÓM TẮT:\n"
                "1. Đọc kỹ và phân tích TOÀN BỘ nội dung được cung cấp\n"
                "2. Xác định và liệt kê CÁC Ý CHÍNH của tài liệu\n"
                "3. Viết một TÓM TẮT CHI TIẾT (10-15 câu, bằng tiếng Việt) được tổ chức theo CÁC Ý CHÍNH sau:\n"
                "   • Mục đích và phạm vi: Mục đích, phạm vi và đối tượng của tài liệu\n"
                "   • Nội dung chính: Các chủ đề, khái niệm và nội dung chính được trình bày\n"
                "   • Phương pháp và kỹ thuật: Các phương pháp, quy trình hoặc kỹ thuật được đề cập (nếu có)\n"
                "   • Ví dụ và ứng dụng: Các ví dụ, minh họa hoặc ứng dụng thực tế (nếu có)\n"
                "   • Kết quả và kết luận: Kết quả, kết luận hoặc đánh giá chính\n"
                "   • Ý nghĩa: Ý nghĩa và giá trị của nội dung\n"
                "4. Mỗi ý chính phải được trình bày rõ ràng, chi tiết và đầy đủ\n"
                "5. Đảm bảo tóm tắt phản ánh ĐẦY ĐỦ tất cả các ý chính, không bỏ sót nội dung quan trọng\n"
                "6. Sử dụng ngôn ngữ rõ ràng, chính xác và dễ hiểu\n"
                "7. Liệt kê 12-15 Từ khóa quan trọng nhất (bao gồm thuật ngữ chuyên ngành), tách nhau bằng dấu phẩy\n\n"
                "TRẢ VỀ KẾT QUẢ THEO ĐỊNH DẠNG DUY NHẤT SAU:\n"
                "Tóm tắt: [Nội dung tóm tắt chi tiết theo các ý chính, mỗi ý được trình bày rõ ràng]\n"
                "Từ khóa: [Từ khóa 1], [Từ khóa 2], [Từ khóa 3]...\n\n"
                f"TOÀN BỘ NỘI DUNG TÀI LIỆU CẦN TÓM TẮT:\n{content_to_send}"
            )
        
        try:
            print(f"[AI] Gửi request tới Gemini API, text length: {len(content_to_send)}, is_long_doc: {is_long_doc}")
            response = self.client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt,
                config={
                    "system_instruction": (
                        "Bạn là một chuyên gia tóm tắt tài liệu học thuật và chuyên nghiệp. "
                        "Nhiệm vụ của bạn là phân tích kỹ lưỡng TOÀN BỘ nội dung tài liệu và tạo ra các tóm tắt "
                        "chi tiết, toàn diện, chính xác và dễ hiểu. Bạn phải xác định và trình bày CÁC Ý CHÍNH "
                        "của tài liệu một cách rõ ràng, có cấu trúc. Bạn phải đảm bảo không bỏ sót bất kỳ nội dung "
                        "quan trọng nào và phản ánh đầy đủ tất cả các ý chính của tài liệu."
                    ),
                    "temperature": 0.3,
                }
            )
            result_text = response.text.strip()
            print(f"[AI] Nhận được response từ Gemini, length: {len(result_text)}")
            
            # PHÂN TÍCH KẾT QUẢ: Chia chuỗi thành Summary và Keywords
            if "Tóm tắt:" in result_text and "Từ khóa:" in result_text:
                summary_part = result_text.split("Tóm tắt:")[1].split("Từ khóa:")[0].strip()
                keywords_str = result_text.split("Từ khóa:")[1].strip()
                keywords = [k.strip() for k in keywords_str.split(',') if k.strip()]
                print(f"[AI] Phân tích thành công: summary length={len(summary_part)}, keywords count={len(keywords)}")
            elif "Tóm tắt:" in result_text:
                # Chỉ có tóm tắt, không có từ khóa
                summary_part = result_text.split("Tóm tắt:")[1].strip()
                keywords = []
                print(f"[AI] Chỉ có tóm tắt, không có từ khóa: summary length={len(summary_part)}")
            else:
                # Fallback: lấy toàn bộ làm summary
                summary_part = result_text
                keywords = []
                print(f"[AI] Fallback: lấy toàn bộ response làm summary, length={len(summary_part)}")
            
            return summary_part, keywords 
            
        except APIError as e:
            print(f"[AI] Lỗi Gemini API: {e}")
            import traceback
            traceback.print_exc()
            return None, None
        except Exception as e:
            print(f"[AI] Lỗi phân tích kết quả AI: {e}")
            import traceback
            traceback.print_exc()
            return None, None
    
    def _summarize_long_document(self, text: str, chunk_size: int, is_long_doc: bool = False):
        """Tóm tắt tài liệu dài bằng cách chia nhỏ và tổng hợp."""
        # Chia text thành các chunk
        chunks = []
        i = 0
        while i < len(text):
            chunk = text[i:i + chunk_size]
            # Cố gắng cắt ở ranh giới câu để không cắt giữa câu
            if i + chunk_size < len(text):
                last_period = chunk.rfind('.')
                last_newline = chunk.rfind('\n')
                cut_point = max(last_period, last_newline)
                if cut_point > chunk_size * 0.7:  # Nếu tìm thấy điểm cắt hợp lý
                    chunk = chunk[:cut_point + 1]
                    i += cut_point + 1
                else:
                    i += chunk_size
            else:
                i += chunk_size
            
            if chunk.strip():  # Chỉ thêm chunk không rỗng
                chunks.append(chunk.strip())
        
        if not chunks:
            return None, None
        
        # Tóm tắt từng chunk với error handling
        chunk_summaries = []
        all_keywords = []
        
        for i, chunk in enumerate(chunks):
            try:
                print(f"Đang tóm tắt chunk {i+1}/{len(chunks)} (kích thước: {len(chunk)} ký tự)...")
                summary, keywords = self._summarize_single_chunk(chunk, is_long_doc=is_long_doc)
                if summary:
                    chunk_summaries.append(f"Phần {i+1}: {summary}")
                if keywords:
                    all_keywords.extend(keywords)
            except Exception as e:
                print(f"Lỗi khi tóm tắt chunk {i+1}: {e}")
                # Tiếp tục với chunk tiếp theo thay vì dừng lại
                continue
        
        if not chunk_summaries:
            print("Không có chunk nào được tóm tắt thành công")
            return None, None
        
        # Tổng hợp các tóm tắt lại với prompt chi tiết hơn cho tài liệu dài
        combined_summaries = "\n\n".join(chunk_summaries)
        
        if is_long_doc:
            final_prompt = (
                "Bạn là một chuyên gia tóm tắt tài liệu học thuật và chuyên nghiệp. "
                "Dưới đây là các tóm tắt từng phần của một tài liệu RẤT DÀI (trên 100 trang). "
                "Nhiệm vụ của bạn là phân tích TOÀN BỘ các tóm tắt này và tạo một TÓM TẮT TỔNG HỢP CHI TIẾT theo CÁC Ý CHÍNH.\n\n"
                "YÊU CẦU TÓM TẮT TỔNG HỢP:\n"
                "1. Đọc kỹ TẤT CẢ các tóm tắt từng phần dưới đây\n"
                "2. Phân tích và kết nối các phần để hiểu cấu trúc tổng thể của tài liệu\n"
                "3. Xác định CÁC Ý CHÍNH xuyên suốt toàn bộ tài liệu\n"
                "4. Tạo một TÓM TẮT TỔNG HỢP CHI TIẾT (20-30 câu, bằng tiếng Việt) được tổ chức theo CÁC Ý CHÍNH sau:\n"
                "   • Tổng quan: Mục đích, phạm vi, đối tượng độc giả và cấu trúc tổng thể của tài liệu\n"
                "   • Nội dung chính: Các chương/phần chính, chủ đề, khái niệm và lý thuyết quan trọng được trình bày\n"
                "   • Phương pháp và kỹ thuật: Các phương pháp, quy trình, kỹ thuật được đề cập trong tài liệu (nếu có)\n"
                "   • Ví dụ và minh họa: Các ví dụ, minh họa, case study hoặc ứng dụng thực tế (nếu có)\n"
                "   • Kết quả và đánh giá: Kết quả, đánh giá, kết luận chính của tài liệu\n"
                "   • Ý nghĩa và ứng dụng: Ý nghĩa, giá trị và ứng dụng thực tế của nội dung\n"
                "5. Mỗi ý chính phải được trình bày rõ ràng, chi tiết và đầy đủ dựa trên tất cả các phần\n"
                "6. Đảm bảo tóm tắt phản ánh ĐẦY ĐỦ tất cả các ý chính từ mọi phần, không bỏ sót nội dung quan trọng\n"
                "7. Sắp xếp nội dung một cách logic, dễ hiểu và có cấu trúc rõ ràng\n"
                "8. Liệt kê 18-25 Từ khóa quan trọng nhất từ toàn bộ tài liệu (bao gồm thuật ngữ chuyên ngành, khái niệm chính), tách nhau bằng dấu phẩy\n\n"
                "TRẢ VỀ KẾT QUẢ THEO ĐỊNH DẠNG DUY NHẤT SAU:\n"
                "Tóm tắt: [Nội dung tóm tắt tổng hợp chi tiết theo các ý chính, mỗi ý được trình bày rõ ràng và đầy đủ]\n"
                "Từ khóa: [Từ khóa 1], [Từ khóa 2], [Từ khóa 3]...\n\n"
                f"TẤT CẢ CÁC TÓM TẮT TỪNG PHẦN CỦA TÀI LIỆU:\n{combined_summaries}"
            )
        else:
            final_prompt = (
                "Bạn là một chuyên gia tóm tắt tài liệu học thuật và chuyên nghiệp. "
                "Dưới đây là các tóm tắt từng phần của một tài liệu dài. "
                "Nhiệm vụ của bạn là phân tích TOÀN BỘ các tóm tắt này và tạo một TÓM TẮT TỔNG HỢP theo CÁC Ý CHÍNH.\n\n"
                "YÊU CẦU TÓM TẮT TỔNG HỢP:\n"
                "1. Đọc kỹ TẤT CẢ các tóm tắt từng phần dưới đây\n"
                "2. Phân tích và kết nối các phần để hiểu nội dung tổng thể\n"
                "3. Xác định CÁC Ý CHÍNH xuyên suốt toàn bộ tài liệu\n"
                "4. Tạo một TÓM TẮT TỔNG HỢP (10-15 câu, bằng tiếng Việt) được tổ chức theo CÁC Ý CHÍNH sau:\n"
                "   • Mục đích và phạm vi: Mục đích và phạm vi của tài liệu\n"
                "   • Nội dung chính: Các nội dung chính được trình bày trong toàn bộ tài liệu\n"
                "   • Phương pháp và kỹ thuật: Các phương pháp, quy trình hoặc kỹ thuật (nếu có)\n"
                "   • Kết quả và kết luận: Các điểm quan trọng và kết luận chính\n"
                "   • Ý nghĩa: Ý nghĩa và giá trị của nội dung\n"
                "5. Mỗi ý chính phải được trình bày rõ ràng và đầy đủ\n"
                "6. Đảm bảo tóm tắt phản ánh các ý chính từ tất cả các phần\n"
                "7. Liệt kê 12-15 Từ khóa quan trọng nhất từ toàn bộ tài liệu, tách nhau bằng dấu phẩy\n\n"
                "TRẢ VỀ KẾT QUẢ THEO ĐỊNH DẠNG DUY NHẤT SAU:\n"
                "Tóm tắt: [Nội dung tóm tắt tổng hợp theo các ý chính, mỗi ý được trình bày rõ ràng]\n"
                "Từ khóa: [Từ khóa 1], [Từ khóa 2], [Từ khóa 3]...\n\n"
                f"TẤT CẢ CÁC TÓM TẮT TỪNG PHẦN CỦA TÀI LIỆU:\n{combined_summaries}"
            )
        
        try:
            response = self.client.models.generate_content(
                model=MODEL_NAME,
                contents=final_prompt,
                config={
                    "system_instruction": (
                        "Bạn là một chuyên gia tóm tắt tài liệu học thuật và chuyên nghiệp. "
                        "Nhiệm vụ của bạn là phân tích kỹ lưỡng TOÀN BỘ nội dung tài liệu và tạo ra các tóm tắt "
                        "chi tiết, toàn diện, chính xác và dễ hiểu. Bạn phải xác định và trình bày CÁC Ý CHÍNH "
                        "của tài liệu một cách rõ ràng, có cấu trúc. Bạn phải đảm bảo không bỏ sót bất kỳ nội dung "
                        "quan trọng nào và phản ánh đầy đủ tất cả các ý chính của tài liệu."
                    ),
                    "temperature": 0.3,
                }
            )
            result_text = response.text.strip()
            
            # PHÂN TÍCH KẾT QUẢ
            if "Tóm tắt:" in result_text and "Từ khóa:" in result_text:
                summary_part = result_text.split("Tóm tắt:")[1].split("Từ khóa:")[0].strip()
                keywords_str = result_text.split("Từ khóa:")[1].strip()
                keywords = [k.strip() for k in keywords_str.split(',') if k.strip()]
            else:
                # Fallback: lấy tóm tắt đầu tiên và keywords từ các chunk
                summary_part = chunk_summaries[0] if chunk_summaries else result_text
                # Lấy keywords từ tất cả các chunk, loại bỏ trùng lặp
                keyword_counter = Counter(all_keywords)
                keywords = [k for k, _ in keyword_counter.most_common(15)]
            
            return summary_part, keywords
            
        except APIError as e:
            print(f"Lỗi Gemini API khi tổng hợp: {e}")
            # Fallback: nối các tóm tắt chunk lại
            fallback_summary = " ".join([s.split(": ", 1)[1] if ": " in s else s for s in chunk_summaries[:3]])
            keyword_counter = Counter(all_keywords)
            fallback_keywords = [k for k, _ in keyword_counter.most_common(12)]
            return fallback_summary[:500], fallback_keywords
        except Exception as e:
            print(f"Lỗi phân tích kết quả AI khi tổng hợp: {e}")
            return None, None
            
       # ============================================================
# HÀM: Đọc file Word định dạng + / - (dòng in đậm là đúng)
# ============================================================
from docx import Document

def parse_quiz_docx(file_path: str):
    """
    Đọc file .docx theo quy tắc:
      + Dòng bắt đầu bằng '+' : câu hỏi
      - Dòng bắt đầu bằng '-' : đáp án
      Đáp án đúng được in đậm (bold) trong Word.

    Trả về: (title, questions[])
    """
    doc = Document(file_path)
    questions = []
    qid = 1
    current_question = None
    current_choices = []
    correct_letter = None

    for para in doc.paragraphs:
        text = (para.text or "").strip()
        if not text:
            continue

        # Câu hỏi
        if text.startswith("+"):
            # lưu câu trước (nếu có)
            if current_question and current_choices:
                questions.append({
                    "id": f"q{qid}",
                    "text": current_question,
                    "choices": current_choices,
                    "answer": correct_letter or "A"
                })
                qid += 1

            current_question = text[1:].strip()
            current_choices = []
            correct_letter = None
            continue

        # Đáp án
        if text.startswith("-") and current_question:
            # kiểm tra in đậm ở bất kỳ run nào
            is_bold = any(bool(getattr(run, "bold", False)) for run in para.runs)
            choice_text = text[1:].strip()
            choice_letter = chr(65 + len(current_choices))  # A, B, C, D,...

            current_choices.append({
                "id": choice_letter,
                "text": choice_text
            })
            if is_bold:
                correct_letter = choice_letter

    # thêm câu cuối cùng (nếu còn dở)
    if current_question and current_choices:
        questions.append({
            "id": f"q{qid}",
            "text": current_question,
            "choices": current_choices,
            "answer": correct_letter or "A"
        })

    title = "Bộ câu hỏi từ file Word"
    return (title, questions)


# Khởi tạo một thể hiện (instance) để các controller sử dụng
try:
    ai_service = AIService()
except ValueError as e:
    # Xử lý nếu Key chưa được cấu hình
    print(e)
    ai_service = None