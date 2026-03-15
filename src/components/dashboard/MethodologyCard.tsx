import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function MethodologyCard() {
  return (
    <Card className="border-border/78 bg-card/82">
      <CardHeader className="pb-1.5">
        <CardTitle className="text-[11.5px]">Methodology & Sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
        <p>
          Signal blend combines Census starts, BLS labor, project announcements, bond issuance, and sentiment indicators, normalized for
          comparable regional momentum scoring.
        </p>
        <p>Forecast rendering is intentionally static in this phase to finalize visual shell fidelity ahead of live endpoint wiring.</p>
      </CardContent>
    </Card>
  )
}
