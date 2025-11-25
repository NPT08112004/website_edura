# run.py

import sys
import os

# Thêm đường dẫn thư mục hiện tại (D:\...\Edura.Api) vào PATH
# để Python có thể tìm thấy gói 'app'
sys.path.append(os.path.dirname(os.path.abspath(__file__)))


from app import create_app, socketio

# Tạo ứng dụng Flask
app = create_app()

if __name__ == '__main__':
    # Server sẽ chạy tại http://127.0.0.1:5000/
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
 
    