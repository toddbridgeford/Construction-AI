#!/usr/bin/env ruby
require 'yaml'

OPENAPI_PATH = File.expand_path('../openapi.yaml', __dir__)
EXPECTED_VERSION = '3.1.0'
EXPECTED_SERVER = 'https://construction-ai.toddbridgeford.workers.dev'
REQUIRED_NEW_PATHS = ['/construction/terminal', '/construction/market-radar']
REQUIRED_PATHS = REQUIRED_NEW_PATHS + ['/spending/ytd/summary']
REQUIRED_SCHEMAS = ['ConstructionTerminalResponse', 'ConstructionMarketRadarResponse']

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

  props = sch['properties']
  errors << "Referenced component schema #{name} must define non-empty properties" unless props.is_a?(Hash) && !props.empty?
end

if errors.any?
  warn 'OpenAPI validation failed:'
  errors.each { |e| warn "- #{e}" }
  exit 1
end

puts 'OpenAPI validation passed.'
