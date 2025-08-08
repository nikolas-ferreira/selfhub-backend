import prisma from "../../shared/prisma"
import OpenAI from "openai"

interface GetOrderInsightsRequest {
  restaurantId: string
}

export class GetOrderInsightsService {
  private openai: OpenAI

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  async execute({ restaurantId }: GetOrderInsightsRequest) {
    const orders = await prisma.order.findMany({
      where: { restaurantId },
      include: {
        items: {
          include: { product: true }
        }
      },
      orderBy: { orderedAt: "desc" }
    })

    const prompt =
      "Você é um assistente especializado em analisar dados de restaurantes. " +
      "Com base nos pedidos fornecidos, gere insights sobre tempo de espera, " +
      "tempo de preparo, produtos mais vendidos e sugestões para aumentar o faturamento. \nPedidos:" +
      JSON.stringify(orders)

    const completion = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }]
    })

    const message = completion.choices[0].message?.content?.trim()

    return message
  }
}

