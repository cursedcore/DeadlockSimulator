// Este archivo es un ejemplo de cómo implementar los endpoints necesarios

const express = require("express")
const axios = require("axios")
const crypto = require("crypto")

const app = express()
app.use(express.json())

// CONFIGURACIÓN DE CYBERSOURCE - Reemplaza con tus credenciales de sandbox
const CYBERSOURCE_CONFIG = {
  merchantId: "TU_MERCHANT_ID",
  apiKey: "TU_API_KEY",
  secretKey: "TU_SECRET_KEY",
  environment: "apitest.cybersource.com", // Sandbox
}

// Función para generar la firma de autenticación
function generateSignature(method, resourcePath, body, date) {
  const digest = "SHA-256=" + crypto.createHash("sha256").update(body).digest("base64")

  const signatureHeader = [
    `host: ${CYBERSOURCE_CONFIG.environment}`,
    `date: ${date}`,
    `(request-target): ${method.toLowerCase()} ${resourcePath}`,
    `digest: ${digest}`,
    `v-c-merchant-id: ${CYBERSOURCE_CONFIG.merchantId}`,
  ].join("\n")

  const signature = crypto.createHmac("sha256", CYBERSOURCE_CONFIG.secretKey).update(signatureHeader).digest("base64")

  return {
    signature,
    digest,
  }
}

// Endpoint 1: Generar Capture Context para Flex
app.post("/api/generate-capture-context", async (req, res) => {
  try {
    const resourcePath = "/microform/v2/sessions"
    const method = "POST"
    const date = new Date().toUTCString()

    const requestBody = {
      targetOrigins: [req.headers.origin || "http://localhost:3000"],
      allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX"],
      clientVersion: "v2.0",
    }

    const body = JSON.stringify(requestBody)
    const { signature, digest } = generateSignature(method, resourcePath, body, date)

    const headers = {
      "Content-Type": "application/json",
      "v-c-merchant-id": CYBERSOURCE_CONFIG.merchantId,
      Date: date,
      Host: CYBERSOURCE_CONFIG.environment,
      Digest: digest,
      Signature: `keyid="${CYBERSOURCE_CONFIG.apiKey}", algorithm="HmacSHA256", headers="host date (request-target) digest v-c-merchant-id", signature="${signature}"`,
    }

    const response = await axios.post(`https://${CYBERSOURCE_CONFIG.environment}${resourcePath}`, requestBody, {
      headers,
    })

    console.log("[Backend] Capture context generado exitosamente")
    res.json({ captureContext: response.data.keyId })
  } catch (error) {
    console.error("[Backend] Error al generar capture context:", error.response?.data || error.message)
    res.status(500).json({
      error: "Error al generar capture context",
      details: error.response?.data,
    })
  }
})

// Endpoint 2: Procesar el pago
app.post("/api/process-payment", async (req, res) => {
  try {
    const { token, amount, currency, cardholderName, email } = req.body

    const resourcePath = "/pts/v2/payments"
    const method = "POST"
    const date = new Date().toUTCString()

    const requestBody = {
      clientReferenceInformation: {
        code: "TC" + Date.now(),
      },
      processingInformation: {
        capture: false, // true para captura inmediata, false para autorización solamente
      },
      paymentInformation: {
        card: {
          expirationYear: token.expirationYear,
          expirationMonth: token.expirationMonth,
          type: token.cardType,
        },
        tokenizedCard: {
          transientTokenJwt: token,
        },
      },
      orderInformation: {
        amountDetails: {
          totalAmount: amount,
          currency: currency,
        },
        billTo: {
          firstName: cardholderName.split(" ")[0],
          lastName: cardholderName.split(" ").slice(1).join(" ") || "Apellido",
          email: email,
        },
      },
    }

    const body = JSON.stringify(requestBody)
    const { signature, digest } = generateSignature(method, resourcePath, body, date)

    const headers = {
      "Content-Type": "application/json",
      "v-c-merchant-id": CYBERSOURCE_CONFIG.merchantId,
      Date: date,
      Host: CYBERSOURCE_CONFIG.environment,
      Digest: digest,
      Signature: `keyid="${CYBERSOURCE_CONFIG.apiKey}", algorithm="HmacSHA256", headers="host date (request-target) digest v-c-merchant-id", signature="${signature}"`,
    }

    const response = await axios.post(`https://${CYBERSOURCE_CONFIG.environment}${resourcePath}`, requestBody, {
      headers,
    })

    console.log("[Backend] Pago procesado:", response.data)

    if (response.data.status === "AUTHORIZED" || response.data.status === "AUTHORIZED_PENDING_REVIEW") {
      res.json({
        success: true,
        transactionId: response.data.id,
        status: response.data.status,
        message: "Pago procesado exitosamente",
      })
    } else {
      res.status(400).json({
        success: false,
        message: "Pago rechazado",
        details: response.data,
      })
    }
  } catch (error) {
    console.error("[Backend] Error al procesar pago:", error.response?.data || error.message)
    res.status(500).json({
      success: false,
      error: "Error al procesar el pago",
      message: error.response?.data?.message || error.message,
    })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`[Backend] Servidor corriendo en puerto ${PORT}`)
})
