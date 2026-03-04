export default async function handler(req) {

const fredKey = process.env.FRED_API_KEY
const blsKey = process.env.BLS_API_KEY

const cpi = await fetch(
`https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${fredKey}&file_type=json`
)

const cpiData = await cpi.json()

return new Response(JSON.stringify({
CPI: cpiData.observations.slice(-1)[0]
}))

}
