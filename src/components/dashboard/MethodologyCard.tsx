import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function MethodologyCard() {
  return (
    <Card className="border-border/78 bg-card/82">
      <CardHeader className="pb-1.5">
        <CardTitle className="text-[11.5px]">Methodology & Sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
        <p>
          Signal blend combines Census housing activity, BLS construction employment, and FRED rate signals, normalized for
          comparable momentum scoring with graceful source fallback.
        </p>
        <p>Forecasts run from the same normalized live-or-fallback series used in charts and KPIs.</p>
      </CardContent>
    </Card>
  )
}
