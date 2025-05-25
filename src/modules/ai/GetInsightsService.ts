import prisma from "../../shared/prisma"
import fetch from "node-fetch"

export class GetInsightsService {
  private readonly API_URL = "https://api.replicate.com/v1/predictions"
  private readonly REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN ?? ""

  async execute(restaurantId: string) {
    const orders = await prisma.order.findMany({
      where: { restaurantId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    })

    if (orders.length === 0) {
      return "Ainda não há pedidos suficientes para gerar insights."
    }

    const resumoPedidos = orders.map((order, index) => {
      const itens = order.items
        .map((item) => `${item.quantity}x ${item.product.name}`)
        .join(", ")
      return `Pedido ${index + 1}: ${itens}`
    }).join("\n")

    const prompt = `
Você é um analista de dados gastronômico. Com base nos seguintes pedidos de um restaurante, gere um insight em português que ajude o gestor a entender tendências ou oportunidades de melhoria:

${resumoPedidos}

Responda com um insight claro e direto em português.
    `.trim()

    const response = await fetch(this.API_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "", // StableLM Base Alpha 3B
        input: {
          prompt,
          max_length: 200,
          temperature: 0.7,
        },
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Replicate API error: ${response.status} - ${errorBody}`)
    }

    const data = await response.json()

    let predictionUrl = data.urls.get
    let result: any = null

    while (true) {
      const res = await fetch(predictionUrl, {
        headers: { Authorization: `Token ${this.REPLICATE_API_TOKEN}` },
      })
      const json = await res.json()

      if (json.status === "succeeded") {
        result = json.output
        break
      } else if (json.status === "failed") {
        throw new Error("Prediction failed")
      }

      await new Promise((r) => setTimeout(r, 1000))
    }

    return result
  }
}
