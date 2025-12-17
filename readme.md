# Formulario de Pago CyberSource

Integración completa con CyberSource Flex Microform para tokenización segura de tarjetas.

## Configuración del Backend (Python/Flask)

### 1. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 2. Configurar credenciales de CyberSource

En el archivo `server.py`, reemplaza las credenciales en las líneas 11-13:

```python
MERCHANT_ID = "tu_merchant_id"           # Tu Merchant ID de CyberSource
MERCHANT_KEY_ID = "tu_key_id"            # Tu API Key ID
MERCHANT_SECRET_KEY = "tu_secret_key"    # Tu Secret Key (en base64)
```

### 3. Obtener credenciales

1. Regístrate en [CyberSource Developer Center](https://developer.cybersource.com/)
2. Crea una cuenta de sandbox/test
3. Ve a **Payment Configuration** → **Key Management**
4. Genera tus credenciales REST API:
   - Merchant ID
   - Key ID (API Key ID)
   - Shared Secret Key (en formato base64)

### 4. Iniciar el servidor backend

```bash
python server.py
```

El servidor correrá en `http://localhost:3000`

## Uso del Frontend

1. Abre `index.html` en tu navegador o usa un servidor local:
   ```bash
   # Opción 1: Con Python
   python -m http.server 8080
   
   # Opción 2: Con Node.js
   npx http-server -p 8080
   ```

2. Accede a `http://localhost:8080`

3. El formulario se conectará automáticamente al backend en `localhost:3000`

4. Ingresa datos de prueba y procesa el pago

## Tarjetas de Prueba

Usa estas tarjetas en el ambiente de sandbox de CyberSource:

### VISA (Aprobada)
- **Número:** 4111111111111111
- **Fecha:** Cualquier fecha futura (ej: 12/25)
- **CVV:** 123

### MasterCard (Aprobada)
- **Número:** 5555555555554444
- **Fecha:** Cualquier fecha futura
- **CVV:** 123

### American Express (Aprobada)
- **Número:** 378282246310005
- **Fecha:** Cualquier fecha futura
- **CVV:** 1234

### VISA (Rechazada - Fondos insuficientes)
- **Número:** 4000300011112220
- **Fecha:** Cualquier fecha futura
- **CVV:** 123

## Características

✅ **Solo campos necesarios** - Número de tarjeta, nombre, expiración, CVV, monto y moneda  
✅ **Tokenización segura** con CyberSource Flex Microform  
✅ **Soporte para USD y HNL** (Dólar y Lempira Hondureño)  
✅ **Vista previa de tarjeta animada** en tiempo real  
✅ **Diseño responsive** para móvil y desktop  
✅ **Compatible con PCI DSS** - datos sensibles nunca tocan tu servidor  
✅ **Backend en Python/Flask** para fácil integración  

## Estructura del Proyecto

```
.
├── index.html          # Frontend con formulario de pago
├── server.py           # Backend Python/Flask con endpoints API
├── requirements.txt    # Dependencias de Python
└── README.md          # Esta documentación
```

## API Endpoints

### POST /api/generate-capture-context

Genera el capture context necesario para inicializar Flex Microform.

**Headers:**
```json
{
  "Content-Type": "application/json"
}
```

**Response:**
```json
{
  "captureContext": "eyJraWQiOiJ6dSI6IkZsZXgiLCJjdHgiO..."
}
```

### POST /api/process-payment

Procesa el pago usando el token JWT generado por Flex.

**Body:**
```json
{
  "token": "eyJraWQiOiIwODZCV...",
  "amount": "100.00",
  "currency": "USD",
  "cardholderName": "Juan Pérez"
}
```

**Response exitosa:**
```json
{
  "success": true,
  "transactionId": "6850598303726693704009",
  "status": "AUTHORIZED",
  "message": "Pago procesado exitosamente"
}
```

**Response con error:**
```json
{
  "success": false,
  "message": "Error al procesar el pago",
  "details": "..."
}
```

### GET /health

Verifica que el servidor esté funcionando.

**Response:**
```json
{
  "status": "ok",
  "message": "Servidor Python corriendo"
}
```

## Flujo de Pago

1. **Frontend** solicita capture context al backend
2. **Backend** genera capture context con CyberSource usando autenticación HMAC
3. **Frontend** inicializa Flex Microform con el capture context
4. Usuario ingresa datos de tarjeta (los datos permanecen en CyberSource)
5. **Flex** tokeniza la tarjeta y devuelve un JWT
6. **Frontend** envía el token + datos del pago al backend
7. **Backend** procesa el pago con CyberSource usando el token
8. **CyberSource** autoriza o rechaza la transacción
9. **Backend** devuelve resultado al frontend

## Seguridad

🔒 **Los datos de la tarjeta NUNCA pasan por tu servidor**  
🔒 **CyberSource Flex maneja la tokenización de forma segura**  
🔒 **Solo el token JWT se envía a tu backend**  
🔒 **Cumple con los estándares PCI DSS**  
🔒 **Autenticación HMAC SHA-256 para todas las llamadas API**  

## Producción

Para usar en producción:

1. **Cambia la URL de la API en `server.py`:**
   ```python
   CYBERSOURCE_API_URL = "https://api.cybersource.com"
   ```

2. **Usa credenciales de producción** (no de sandbox)

3. **Actualiza el API_BASE_URL** en `index.html` con tu dominio real

4. **Actualiza targetOrigins** en el endpoint de capture context con tu dominio

5. **Implementa HTTPS** (requerido por CyberSource)

6. **Considera agregar:**
   - Autenticación de usuarios
   - Webhooks para notificaciones
   - Sistema de captura de pagos autorizados
   - Manejo de reembolsos
   - Logging y monitoreo
   - Rate limiting

## Troubleshooting

### Error: "Cannot read property 'createToken' of undefined"
- Verifica que el backend esté corriendo en `http://localhost:3000`
- Confirma que las credenciales de CyberSource sean correctas
- Revisa la consola del navegador para más detalles

### Error: "CORS policy"
- El backend ya incluye CORS habilitado con Flask-CORS
- Verifica que el `targetOrigins` en el capture context coincida con tu URL del frontend

### Error: "Invalid signature"
- Confirma que el Secret Key sea correcto y esté en formato base64
- Verifica que el Merchant ID y Key ID sean correctos
- Asegúrate de que la fecha del servidor esté sincronizada

### Pago rechazado
- Usa las tarjetas de prueba oficiales de CyberSource listadas arriba
- Verifica que el monto sea válido (mayor a 0)
- Revisa los logs del backend Python para más información

### Error al inicializar el formulario
- Verifica que el backend esté corriendo (`python server.py`)
- Prueba el endpoint de health: `http://localhost:3000/health`
- Revisa los logs en la terminal del servidor Python

## Monedas Soportadas

- **USD** - Dólar Estadounidense
- **HNL** - Lempira Hondureño

## Campos del Formulario

El formulario incluye **únicamente los campos necesarios** para CyberSource:

- **Número de Tarjeta** (tokenizado por Flex Microform)
- **Nombre del Titular**
- **Fecha de Expiración** (mes y año, tokenizado)
- **CVV** (tokenizado por Flex Microform)
- **Monto**
- **Moneda** (USD o HNL)

## Recursos Adicionales

- [CyberSource Developer Center](https://developer.cybersource.com/)
- [Flex Microform Documentation](https://developer.cybersource.com/docs/cybs/en-us/digital-accept-flex/developer/all/rest/digital-accept-flex/microform-integ.html)
- [REST API Reference](https://developer.cybersource.com/api-reference-assets/index.html)
- [Test Cards](https://developer.cybersource.com/hello-world/sandbox-testing-guide.html)
- [Python Requests Library](https://docs.python-requests.org/)
- [Flask Documentation](https://flask.palletsprojects.com/)

## Licencia

Este código es un ejemplo para fines educativos y de prueba.
