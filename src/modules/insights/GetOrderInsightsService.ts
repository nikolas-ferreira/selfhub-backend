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
    let orders: any[] = []
    try {
      orders = await prisma.order.findMany({
        where: { restaurantId },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          orderedAt: true,
          preparedAt: true,
          deliveredAt: true,
          finishedAt: true,
          canceledAt: true,
          tableNumber: true,
          waiterNumber: true,
          totalValue: true,
          paymentMethod: true,
          items: {
            select: {
              quantity: true,
              observation: true,
              ratingStar: true,
              product: {
                select: {
                  name: true,
                  price: true
                }
              }
            }
          }
        },
        orderBy: { orderedAt: "desc" }
      })
      console.log(`Fetched ${orders.length} orders`)
    } catch (error) {
      console.error("Failed to fetch orders for insights", error)
      throw error
    }

    const systemMessage =
      "Você é um consultor especialista em análise de dados para restaurantes, " +
      "com profundo conhecimento em métricas de negócios, tendências de consumo e otimização operacional. " +
      "Sua análise deve ser detalhada, orientada por dados e apresentar insights acionáveis. " +
      "Para cada insight, inclua: o problema ou oportunidade identificado, evidências dos dados e uma recomendação específica."

    const userMessage =
      "Analise detalhadamente estes dados de operação de um restaurante:" +
      JSON.stringify(orders) +
      "\n\nPor favor, forneça uma análise completa com:\n" +
      "1. Um array de \"insights\" contendo pelo menos 11 insights detalhados sobre o desempenho do restaurante (cada insight deve ser um parágrafo com 3-5 frases)\n" +
      "2. Uma \"trendAnalysis\" - análise aprofundada de tendências nos dados (um parágrafo detalhado)\n" +
      "3. Um array de \"recommendations\" com 5 recomendações acionáveis e específicas\n" +
      "4. Um array de \"keyMetrics\" com pelo menos 4 métricas principais, cada uma com: label, value e change (quando aplicável). A change deve ter value e direction (up/down/neutral)\n" +
      "5. Um array de \"productPerformance\" analisando os 3 produtos principais, cada um com: name, analysis, recommendation\n\n" +
      "Responda no formato JSON com as chaves: insights, trendAnalysis, recommendations, keyMetrics, productPerformance. Forneça insights específicos, baseados em dados, e acionáveis. Evite generalidades."

    try {
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
      console.log("OpenAI response:", message)
      const parsed = JSON.parse(message)
      return parsed.insights || []
    } catch (error) {
      console.error("OpenAI API error:", error)
      throw error
    }
  }
}

