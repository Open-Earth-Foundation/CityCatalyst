Set-Location 'C:\Users\piotr\Documents\GitHub\CityCatalyst\climate-advisor\service'
$envLines = Get-Content 'C:\Users\piotr\Documents\GitHub\CityCatalyst\climate-advisor\.env'
$openAiLine = $envLines | Where-Object { $_ -like 'OPENAI_API_KEY=*' } | Select-Object -First 1
if (-not $openAiLine) { throw 'OPENAI_API_KEY not found in climate-advisor/.env' }
$openAiKey = $openAiLine.Substring('OPENAI_API_KEY='.Length)
$env:CA_FEATURE_FLAGS='STATIONARY_ENERGY_AGENTIC'
$env:CA_DATABASE_URL='postgresql://climateadvisor:climateadvisor@127.0.0.1:5432/climateadvisor'
$env:CC_BASE_URL='http://127.0.0.1:3002'
$env:OPENROUTER_BASE_URL='https://api.openai.com/v1'
$env:OPENROUTER_API_KEY=$openAiKey
$env:OPENROUTER_MODEL='gpt-4.1'
$env:OPENROUTER_AGENTIC_FLOW_MODEL='gpt-4.1-mini'
$env:OPENROUTER_TIMEOUT_MS='120000'
& 'C:\Users\piotr\Documents\GitHub\CityCatalyst\climate-advisor\.venv\Scripts\python.exe' -m uvicorn app.main:app --host 127.0.0.1 --port 8080
