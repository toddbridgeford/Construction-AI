export type ProviderMode = 'demo' | 'live'

export type ProviderStatus = {
  mode: ProviderMode
  label: 'Demo Mode' | 'Live Data'
  degradedSources: string[]
  message?: string
  usedFallback: boolean
}

const defaultStatus: ProviderStatus = {
  mode: 'demo',
  label: 'Demo Mode',
  degradedSources: [],
  usedFallback: false
}

export class ProviderRuntime {
  private status: ProviderStatus = defaultStatus

  getStatus(): ProviderStatus {
    return this.status
  }

  setStatus(next: ProviderStatus) {
    this.status = next
  }
}
