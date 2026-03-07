#!/usr/bin/env ruby
require 'yaml'

OPENAPI_PATH = File.expand_path('../openapi.yaml', __dir__)
EXPECTED_VERSION = '3.1.0'
EXPECTED_SERVER = 'https://construction-ai.toddbridgeford.workers.dev'
REQUIRED_NEW_PATHS = [
  '/construction/terminal',
  '/construction/market-radar',
  '/construction/morning-brief',
  '/construction/alerts',
  '/construction/recession-probability',
  '/construction/power',
  '/construction/heatmap',
  '/construction/nowcast',
  '/construction/forecast',
  '/construction/stress-index',
  '/construction/early-warning',
  '/construction/capital-flows',
  '/construction/migration-index',
  '/construction/materials-shock',
  '/construction/labor-shock',
  '/construction/margin-pressure',
  '/construction/bid-intensity',
  '/construction/backlog-quality',
  '/construction/project-risk',
  '/construction/receivables-risk',
  '/construction/payment-delay-risk',
  '/construction/collections-stress',
  '/construction/owner-risk',
  '/construction/developer-fragility',
  '/construction/lender-pullback-risk',
  '/construction/counterparty-quality',
  '/construction/metro-concentration-risk',
  '/construction/counterparty-concentration-risk',
  '/construction/project-mix-exposure',
  '/construction/portfolio-risk'
]
REQUIRED_PATHS = REQUIRED_NEW_PATHS + ['/spending/ytd/summary']
REQUIRED_SCHEMAS = [
  'ConstructionTerminalResponse',
  'ConstructionMarketRadarResponse',
  'ConstructionMorningBriefResponse',
  'ConstructionAlertsResponse',
  'AlertCard',
  'RecessionProbabilityResponse',
  'PowerActorState',
  'ConstructionPowerResponse',
  'HeatmapMarketItem',
  'ConstructionHeatmapResponse',
  'ConstructionNowcastResponse',
  'ForecastMarketItem',
  'ConstructionForecastResponse',
  'StressIndexModel',
  'EarlyWarningModel',
  'CapitalFlowsModel',
  'MigrationMarketItem',
  'MigrationIndexModel',
  'MarketTapeModel',
  'ConstructionStressIndexResponse',
  'ConstructionEarlyWarningResponse',
  'ConstructionCapitalFlowsResponse',
  'ConstructionMigrationIndexResponse',
  'ShockStateEnum',
  'MaterialsShockModel',
  'LaborShockModel',
  'MarginPressureModel',
  'ConstructionMaterialsShockResponse',
  'ConstructionLaborShockResponse',
  'ConstructionMarginPressureResponse',
  'ReceivablesRiskModel',
  'PaymentDelayRiskModel',
  'CollectionsStressModel',
  'ConstructionReceivablesRiskResponse',
  'ConstructionPaymentDelayRiskResponse',
  'ConstructionCollectionsStressResponse',
  'ConstructionBidIntensityResponse',
  'ConstructionBacklogQualityResponse',
  'ConstructionProjectRiskResponse',
  'OwnerRiskModel',
  'DeveloperFragilityModel',
  'LenderPullbackRiskModel',
  'CounterpartyQualityModel',
  'ConstructionOwnerRiskResponse',
  'ConstructionDeveloperFragilityResponse',
  'ConstructionLenderPullbackRiskResponse',
  'ConstructionCounterpartyQualityResponse',
  'MetroConcentrationRiskModel',
  'CounterpartyConcentrationRiskModel',
  'ProjectMixExposureModel',
  'PortfolioRiskModel',
  'ConstructionMetroConcentrationRiskResponse',
  'ConstructionCounterpartyConcentrationRiskResponse',
  'ConstructionProjectMixExposureResponse',
  'ConstructionPortfolioRiskResponse'
]

abort("Missing #{OPENAPI_PATH}") unless File.exist?(OPENAPI_PATH)

doc = YAML.safe_load(File.read(OPENAPI_PATH))
errors = []

errors << "openapi must be #{EXPECTED_VERSION}" unless doc['openapi'] == EXPECTED_VERSION
server_url = doc.dig('servers', 0, 'url')
errors << "servers[0].url must be #{EXPECTED_SERVER}" unless server_url == EXPECTED_SERVER

paths = doc['paths'] || {}
REQUIRED_PATHS.each do |p|
  errors << "paths must include #{p}" unless paths.key?(p)
end
errors << 'paths must not include /terminal' if paths.key?('/terminal')

REQUIRED_NEW_PATHS.each do |path|
  schema = paths.dig(path, 'get', 'responses', '200', 'content', 'application/json', 'schema')
  errors << "#{path} must define GET 200 application/json schema" if schema.nil?
end

components = doc.dig('components', 'schemas') || {}
REQUIRED_SCHEMAS.each do |name|
  errors << "components.schemas must include #{name}" unless components.key?(name)
end

terminal_properties = components.dig('ConstructionTerminalResponse', 'properties', 'terminal', 'properties') || {}
errors << 'ConstructionTerminalResponse terminal schema must include alerts' unless terminal_properties.key?('alerts')
errors << 'ConstructionTerminalResponse terminal schema must include recession_probability' unless terminal_properties.key?('recession_probability')
errors << 'ConstructionTerminalResponse terminal schema must include power_index' unless terminal_properties.key?('power_index')
errors << 'ConstructionTerminalResponse terminal schema must include power_summary' unless terminal_properties.key?('power_summary')
errors << 'ConstructionTerminalResponse terminal schema must include nowcast' unless terminal_properties.key?('nowcast')
errors << 'ConstructionTerminalResponse terminal schema must include forecast_summary' unless terminal_properties.key?('forecast_summary')

errors << 'ConstructionTerminalResponse terminal schema must include stress_index' unless terminal_properties.key?('stress_index')
errors << 'ConstructionTerminalResponse terminal schema must include early_warning' unless terminal_properties.key?('early_warning')
errors << 'ConstructionTerminalResponse terminal schema must include capital_flows' unless terminal_properties.key?('capital_flows')
errors << 'ConstructionTerminalResponse terminal schema must include migration_index' unless terminal_properties.key?('migration_index')
errors << 'ConstructionTerminalResponse terminal schema must include market_tape' unless terminal_properties.key?('market_tape')
errors << 'ConstructionTerminalResponse terminal schema must include collections_stress_summary' unless terminal_properties.key?('collections_stress_summary')
errors << 'ConstructionTerminalResponse terminal schema must include collections_stress' unless terminal_properties.key?('collections_stress')
errors << 'ConstructionTerminalResponse terminal schema must include payment_delay_risk_summary' unless terminal_properties.key?('payment_delay_risk_summary')
errors << 'ConstructionTerminalResponse terminal schema must include payment_delay_risk' unless terminal_properties.key?('payment_delay_risk')
errors << 'ConstructionTerminalResponse terminal schema must include receivables_risk_summary' unless terminal_properties.key?('receivables_risk_summary')
errors << 'ConstructionTerminalResponse terminal schema must include receivables_risk' unless terminal_properties.key?('receivables_risk')


errors << 'ConstructionTerminalResponse terminal schema must include materials_shock' unless terminal_properties.key?('materials_shock')
errors << 'ConstructionTerminalResponse terminal schema must include materials_shock_summary' unless terminal_properties.key?('materials_shock_summary')
errors << 'ConstructionTerminalResponse terminal schema must include labor_shock' unless terminal_properties.key?('labor_shock')
errors << 'ConstructionTerminalResponse terminal schema must include labor_shock_summary' unless terminal_properties.key?('labor_shock_summary')
errors << 'ConstructionTerminalResponse terminal schema must include margin_pressure' unless terminal_properties.key?('margin_pressure')
errors << 'ConstructionTerminalResponse terminal schema must include margin_pressure_summary' unless terminal_properties.key?('margin_pressure_summary')

errors << 'ConstructionTerminalResponse terminal schema must include owner_risk' unless terminal_properties.key?('owner_risk')
errors << 'ConstructionTerminalResponse terminal schema must include owner_risk_summary' unless terminal_properties.key?('owner_risk_summary')
errors << 'ConstructionTerminalResponse terminal schema must include developer_fragility' unless terminal_properties.key?('developer_fragility')
errors << 'ConstructionTerminalResponse terminal schema must include developer_fragility_summary' unless terminal_properties.key?('developer_fragility_summary')
errors << 'ConstructionTerminalResponse terminal schema must include lender_pullback_risk' unless terminal_properties.key?('lender_pullback_risk')
errors << 'ConstructionTerminalResponse terminal schema must include lender_pullback_risk_summary' unless terminal_properties.key?('lender_pullback_risk_summary')
errors << 'ConstructionTerminalResponse terminal schema must include counterparty_quality' unless terminal_properties.key?('counterparty_quality')
errors << 'ConstructionTerminalResponse terminal schema must include counterparty_quality_summary' unless terminal_properties.key?('counterparty_quality_summary')
errors << 'ConstructionTerminalResponse terminal schema must include metro_concentration_risk' unless terminal_properties.key?('metro_concentration_risk')
errors << 'ConstructionTerminalResponse terminal schema must include metro_concentration_risk_summary' unless terminal_properties.key?('metro_concentration_risk_summary')
errors << 'ConstructionTerminalResponse terminal schema must include counterparty_concentration_risk' unless terminal_properties.key?('counterparty_concentration_risk')
errors << 'ConstructionTerminalResponse terminal schema must include counterparty_concentration_risk_summary' unless terminal_properties.key?('counterparty_concentration_risk_summary')
errors << 'ConstructionTerminalResponse terminal schema must include project_mix_exposure' unless terminal_properties.key?('project_mix_exposure')
errors << 'ConstructionTerminalResponse terminal schema must include project_mix_exposure_summary' unless terminal_properties.key?('project_mix_exposure_summary')
errors << 'ConstructionTerminalResponse terminal schema must include portfolio_risk' unless terminal_properties.key?('portfolio_risk')
errors << 'ConstructionTerminalResponse terminal schema must include portfolio_risk_summary' unless terminal_properties.key?('portfolio_risk_summary')

forecast_items = components.dig('ConstructionForecastResponse', 'properties', 'forecast', 'properties', 'strongest_next_12_months', 'items')
errors << 'ConstructionForecastResponse strongest_next_12_months must reference ForecastMarketItem' unless forecast_items&.dig('$ref') == '#/components/schemas/ForecastMarketItem'

referenced = []
paths.each do |route, methods|
  next unless methods.is_a?(Hash) && methods.key?('get')
  schema = methods.dig('get', 'responses', '200', 'content', 'application/json', 'schema')
  next unless schema.is_a?(Hash)

  if schema['$ref'].is_a?(String) && schema['$ref'].start_with?('#/components/schemas/')
    referenced << schema['$ref'].split('/').last
  end
end

referenced.concat(REQUIRED_SCHEMAS)
referenced.uniq.each do |name|
  sch = components[name]
  unless sch.is_a?(Hash)
    errors << "Referenced component schema missing: #{name}"
    next
  end

  next if sch['type'] == 'string' && sch['enum'].is_a?(Array) && !sch['enum'].empty?

  props = sch['properties']
  errors << "Referenced component schema #{name} must define non-empty properties" unless props.is_a?(Hash) && !props.empty?
end

stress_props = components.dig('StressIndexModel', 'properties') || {}
errors << 'StressIndexModel.score must be defined' unless stress_props.key?('score')
errors << 'StressIndexModel.state must be defined' unless stress_props.key?('state')
errors << 'StressIndexModel.trend must be defined' unless stress_props.key?('trend')
errors << 'StressIndexModel.drivers must be defined' unless stress_props.key?('drivers')

early_props = components.dig('EarlyWarningModel', 'properties') || {}
errors << 'EarlyWarningModel.state must be defined' unless early_props.key?('state')
errors << 'EarlyWarningModel.score must be defined' unless early_props.key?('score')
errors << 'EarlyWarningModel.trend must be defined' unless early_props.key?('trend')
errors << 'EarlyWarningModel.drivers must be defined' unless early_props.key?('drivers')

capital_props = components.dig('CapitalFlowsModel', 'properties') || {}
%w[lending_growth private_development_capital manufacturing_investment infrastructure_spending headline explanation].each do |field|
  errors << "CapitalFlowsModel.#{field} must be defined" unless capital_props.key?(field)
end

migration_props = components.dig('MigrationIndexModel', 'properties') || {}
errors << 'MigrationIndexModel.inbound_markets must be defined' unless migration_props.key?('inbound_markets')
errors << 'MigrationIndexModel.outbound_markets must be defined' unless migration_props.key?('outbound_markets')
errors << 'MigrationIndexModel.headline must be defined' unless migration_props.key?('headline')

migration_item_props = components.dig('MigrationMarketItem', 'properties') || {}
errors << 'MigrationMarketItem.market must be defined' unless migration_item_props.key?('market')
errors << 'MigrationMarketItem.score must be defined' unless migration_item_props.key?('score')
errors << 'MigrationMarketItem.explanation must be defined' unless migration_item_props.key?('explanation')

market_tape_risk = components.dig('MarketTapeModel', 'properties', 'risk', 'type')
errors << 'MarketTapeModel.risk must be a string' unless market_tape_risk == 'string'


stress_required = components.dig('StressIndexModel', 'required') || []
%w[score state trend drivers explanation].each do |field|
  errors << "StressIndexModel.required must include #{field}" unless stress_required.include?(field)
end

early_required = components.dig('EarlyWarningModel', 'required') || []
%w[state score trend drivers explanation].each do |field|
  errors << "EarlyWarningModel.required must include #{field}" unless early_required.include?(field)
end

capital_required = components.dig('CapitalFlowsModel', 'required') || []
%w[lending_growth private_development_capital manufacturing_investment infrastructure_spending headline explanation].each do |field|
  errors << "CapitalFlowsModel.required must include #{field}" unless capital_required.include?(field)
end

migration_required = components.dig('MigrationIndexModel', 'required') || []
%w[inbound_markets outbound_markets headline].each do |field|
  errors << "MigrationIndexModel.required must include #{field}" unless migration_required.include?(field)
end

market_tape_required = components.dig('MarketTapeModel', 'required') || []
%w[signal regime liquidity risk construction_index stress_index recession_probability commercial_pct housing_pct top_market weakest_market].each do |field|
  errors << "MarketTapeModel.required must include #{field}" unless market_tape_required.include?(field)
end

if errors.any?
  warn 'OpenAPI validation failed:'
  errors.each { |e| warn "- #{e}" }
  exit 1
end

puts 'OpenAPI validation passed.'

