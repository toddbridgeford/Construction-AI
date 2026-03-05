#!/usr/bin/env ruby
require 'yaml'

OPENAPI_PATH = File.expand_path('../openapi.yaml', __dir__)
EXPECTED_VERSION = '3.1.0'
EXPECTED_SERVER = 'https://construction-ai.toddbridgeford.workers.dev'

abort("Missing #{OPENAPI_PATH}") unless File.exist?(OPENAPI_PATH)

doc = YAML.safe_load(File.read(OPENAPI_PATH))
errors = []

errors << "openapi must be #{EXPECTED_VERSION}" unless doc['openapi'] == EXPECTED_VERSION

server_url = doc.dig('servers', 0, 'url')
errors << "servers[0].url must be #{EXPECTED_SERVER}" unless server_url == EXPECTED_SERVER

paths = doc['paths'] || {}
errors << 'paths must include / and /health' unless paths.key?('/') && paths.key?('/health')
errors << 'paths must not include /terminal' if paths.key?('/terminal')

components = doc.dig('components', 'schemas') || {}

referenced = []

paths.each do |route, methods|
  next unless methods.is_a?(Hash)
  methods.each do |method, op|
    next unless method.to_s.downcase == 'get' && op.is_a?(Hash)
    schema = op.dig('responses', '200', 'content', 'application/json', 'schema')
    if schema.nil?
      errors << "#{route} GET must define responses.200.content.application/json.schema"
      next
    end

    has_ref = schema['$ref'].is_a?(String)
    props = schema['properties']
    has_props = props.is_a?(Hash) && !props.empty?
    errors << "#{route} GET 200 schema must have $ref or non-empty properties" unless has_ref || has_props

    if has_ref && schema['$ref'].start_with?('#/components/schemas/')
      referenced << schema['$ref'].split('/').last
    end
  end
end

referenced.uniq.each do |name|
  sch = components[name]
  unless sch.is_a?(Hash)
    errors << "Referenced component schema missing: #{name}"
    next
  end
  props = sch['properties']
  if !props.is_a?(Hash) || props.empty?
    errors << "Referenced component schema #{name} must define non-empty properties"
  end
end

if errors.any?
  warn "OpenAPI validation failed:"
  errors.each { |e| warn "- #{e}" }
  exit 1
end

puts 'OpenAPI validation passed.'
