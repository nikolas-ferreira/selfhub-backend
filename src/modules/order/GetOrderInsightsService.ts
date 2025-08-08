import prisma from "../../shared/prisma"
import OpenAI from "openai"

interface GetOrderInsightsRequest {
  restaurantId: string
}

export class GetOrderInsightsService {
  private openai: OpenAI

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error("Missing OPENAI_API_KEY environment variable")
    }
    this.openai = new OpenAI({ apiKey })
  }

  async execute({ restaurantId }: GetOrderInsightsRequest) {
    console.log(`Generating insights for restaurant ${restaurantId}`)
    const orders = await prisma.order.findMany({
      where: { restaurantId },
      include: {
        items: {
          include: { product: true }
        }
      },
      orderBy: { orderedAt: "desc" }
    })

    console.log(`Fetched ${orders.length} orders`)

    const prompt =
      "Você é um assistente especializado em analisar dados de restaurantes. " +
      "Com base nos pedidos fornecidos, gere insights sobre tempo de espera, " +
      "tempo de preparo, produtos mais vendidos e sugestões para aumentar o faturamento. \nPedidos:" +
      JSON.stringify(orders)

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }]
      })

      const message = completion.choices[0].message?.content?.trim()
      console.log("OpenAI response:", message)
      return message
    } catch (error) {
      console.error("OpenAI API error:", error)
      throw error
    }
  }
}

