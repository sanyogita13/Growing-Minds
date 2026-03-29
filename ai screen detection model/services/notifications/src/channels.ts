import type { DetectionEvent, RiskSnapshot } from "@ai-monitor/contracts";

export interface NotificationChannel {
  sendIncident(event: DetectionEvent): Promise<void>;
  sendRiskEscalation(snapshot: RiskSnapshot): Promise<void>;
}

export class WebhookChannel implements NotificationChannel {
  constructor(private readonly endpoint: string) {}

  async sendIncident(event: DetectionEvent): Promise<void> {
    await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "incident", payload: event }),
    });
  }

  async sendRiskEscalation(snapshot: RiskSnapshot): Promise<void> {
    await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "risk_escalation", payload: snapshot }),
    });
  }
}
