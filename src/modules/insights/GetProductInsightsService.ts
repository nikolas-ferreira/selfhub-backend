import prisma from "../../shared/prisma"
import OpenAI from "openai"

interface GetProductInsightsRequest {
  restaurantId: string
}

/** Aggregates per-product order volume for a restaurant and asks OpenAI for per-product insights. */
export class GetProductInsightsService {
  private openai: OpenAI

  /** Logs (does not throw) if `OPENAI_API_KEY` is missing — the first `execute()` call will then fail at the OpenAI request itself. */
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error("Missing OPENAI_API_KEY environment variable")
    }
    this.openai = new OpenAI({ apiKey })
  }

  /**
   * Builds a name→{count, price} aggregate from `OrderItem`s, then asks the
   * model to analyze it. DB and OpenAI failures are left uncaught — the
   * controller logs them with full request context via `respondInternalError`.
   */
  async execute({ restaurantId }: GetProductInsightsRequest) {
    const items = await prisma.orderItem.findMany({
      where: { order: { restaurantId } },
      select: {
        quantity: true,
        product: {
          select: {
            name: true,
            price: true
          }
        }
      }
    })

    const productStats: Record<string, { count: number; price: number }> = {}
    for (const item of items) {
      const name = item.product.name
      const price = item.product.price
      if (!productStats[name]) {
        productStats[name] = { count: 0, price }
      }
      productStats[name].count += item.quantity
    }

    const productsArray = Object.entries(productStats).map(([name, data]) => ({
      name,
      totalOrders: data.count,
      price: data.price
    }))

    const systemMessage =
      "Você é um consultor especialista em análise de dados para restaurantes, " +
      "com profundo conhecimento em métricas de vendas e desempenho de produtos. " +
      "Sua análise deve ser detalhada, orientada por dados e apresentar insights acionáveis."

    const userMessage =
      "Analise detalhadamente estes dados de pedidos por produto:" +
      JSON.stringify(productsArray) +
      "\n\nPara cada produto, forneça um array 'insights' com pelo menos 4 observações e recomendações específicas. " +
      "Responda no formato JSON com a chave 'products', contendo um array onde cada item possui: name e insights (array de strings)."

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ]
    })

    const message = completion.choices[0].message?.content?.trim() || "{}"
    const parsed = JSON.parse(message)
    return parsed.products || []
  }
}

