from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone

app = Flask(__name__)
CORS(app)

# ========================================
# CONFIGURACIÓN DE CYBERSOURCE
# ========================================
# Reemplaza estos valores con tus credenciales de CyberSource
MERCHANT_ID = "tu_merchant_id"
MERCHANT_KEY_ID = "tu_key_id"
MERCHANT_SECRET_KEY = "tu_secret_key"

# URLs de CyberSource
# Sandbox (pruebas)
CYBERSOURCE_API_URL = "https://apitest.cybersource.com"
# Producción (descomentar cuando estés listo)
# CYBERSOURCE_API_URL = "https://api.cybersource.com"

# ========================================
# FUNCIONES AUXILIARES
# ========================================

def generate_signature(endpoint, method, payload):
    """Genera la firma requerida por CyberSource"""
    timestamp = datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S GMT')
    
    # Digest del payload
    digest = "SHA-256=" + base64.b64encode(
        hashlib.sha256(payload.encode('utf-8')).digest()
    ).decode('utf-8')
    
    # String de firma
    signing_string = f"host: apitest.cybersource.com\ndate: {timestamp}\n(request-target): {method.lower()} {endpoint}\ndigest: {digest}\nv-c-merchant-id: {MERCHANT_ID}"
    
    # HMAC signature
    signature_bytes = hmac.new(
        base64.b64decode(MERCHANT_SECRET_KEY),
        signing_string.encode('utf-8'),
        hashlib.sha256
    ).digest()
    
    signature = base64.b64encode(signature_bytes).decode('utf-8')
    
    return {
        'timestamp': timestamp,
        'digest': digest,
        'signature': signature
    }

def get_headers(endpoint, method, payload):
    """Genera los headers necesarios para la API de CyberSource"""
    sig_data = generate_signature(endpoint, method, payload)
    
    signature_header = (
        f'keyid="{MERCHANT_KEY_ID}", '
        f'algorithm="HmacSHA256", '
        f'headers="host date (request-target) digest v-c-merchant-id", '
        f'signature="{sig_data["signature"]}"'
    )
    
    return {
        'Host': 'apitest.cybersource.com',
        'Date': sig_data['timestamp'],
        'Digest': sig_data['digest'],
        'v-c-merchant-id': MERCHANT_ID,
        'Signature': signature_header,
        'Content-Type': 'application/json'
    }

# ========================================
# ENDPOINTS DE LA API
# ========================================

@app.route('/api/generate-capture-context', methods=['POST'])
def generate_capture_context():
    """Genera el capture context necesario para inicializar Flex Microform"""
    try:
        endpoint = '/microform/v2/sessions'
        
        payload = {
            "targetOrigins": ["http://localhost:8080", "http://127.0.0.1:8080"],
            "clientVersion": "v2.0"
        }
        
        payload_json = json.dumps(payload)
        headers = get_headers(endpoint, 'POST', payload_json)
        
        response = requests.post(
            f"{CYBERSOURCE_API_URL}{endpoint}",
            headers=headers,
            data=payload_json
        )
        
        if response.status_code == 201:
            data = response.json()
            return jsonify({
                'captureContext': data['keyId']
            }), 200
        else:
            print(f"Error de CyberSource: {response.status_code}")
            print(f"Respuesta: {response.text}")
            return jsonify({
                'error': 'Error al generar capture context',
                'details': response.text
            }), 500
            
    except Exception as e:
        print(f"Error en generate_capture_context: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/process-payment', methods=['POST'])
def process_payment():
    """Procesa el pago usando el token de la tarjeta"""
    try:
        data = request.json
        token = data.get('token')
        amount = data.get('amount')
        currency = data.get('currency')
        cardholder_name = data.get('cardholderName')
        email = data.get('email')
        
        endpoint = '/pts/v2/payments'
        
        payload = {
            "clientReferenceInformation": {
                "code": f"TC{datetime.now().strftime('%Y%m%d%H%M%S')}"
            },
            "processingInformation": {
                "capture": True,
                "commerceIndicator": "internet"
            },
            "paymentInformation": {
                "card": {
                    "number": token,
                    "expirationMonth": data.get('expirationMonth'),
                    "expirationYear": data.get('expirationYear'),
                    "securityCode": data.get('securityCode')
                }
            },
            "orderInformation": {
                "amountDetails": {
                    "totalAmount": amount,
                    "currency": currency
                },
                "billTo": {
                    "firstName": cardholder_name.split()[0] if cardholder_name else "Cliente",
                    "lastName": " ".join(cardholder_name.split()[1:]) if len(cardholder_name.split()) > 1 else "Apellido",
                    "email": email,
                    "country": "HN" if currency == "HNL" else "US"
                }
            }
        }
        
        payload_json = json.dumps(payload)
        headers = get_headers(endpoint, 'POST', payload_json)
        
        response = requests.post(
            f"{CYBERSOURCE_API_URL}{endpoint}",
            headers=headers,
            data=payload_json
        )
        
        if response.status_code == 201:
            result = response.json()
            transaction_id = result.get('id')
            status = result.get('status')
            
            return jsonify({
                'success': True,
                'transactionId': transaction_id,
                'status': status,
                'message': 'Pago procesado exitosamente'
            }), 200
        else:
            print(f"Error al procesar pago: {response.status_code}")
            print(f"Respuesta: {response.text}")
            return jsonify({
                'success': False,
                'error': 'Error al procesar el pago',
                'details': response.text
            }), 400
            
    except Exception as e:
        print(f"Error en process_payment: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health():
    """Endpoint para verificar que el servidor está funcionando"""
    return jsonify({'status': 'ok', 'message': 'Servidor Python corriendo'}), 200

if __name__ == '__main__':
    print("=" * 50)
    print("Servidor CyberSource Python iniciado")
    print("URL: http://localhost:3000")
    print("=" * 50)
    print("\nRECUERDA configurar tus credenciales:")
    print("- MERCHANT_ID")
    print("- MERCHANT_KEY_ID")
    print("- MERCHANT_SECRET_KEY")
    print("=" * 50)
    app.run(debug=True, port=3000)
