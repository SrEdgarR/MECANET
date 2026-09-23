# Testing Setup Script for MECANET
# Run this script to install all testing dependencies

Write-Host "🧪 Installing Testing Dependencies for MECANET..." -ForegroundColor Cyan
Write-Host ""

# Navigate to client directory
Set-Location -Path "client"

Write-Host "📦 Installing Vitest and Testing Libraries..." -ForegroundColor Yellow
npm install --save-dev vitest @vitest/ui @vitest/coverage-v8

Write-Host "📦 Installing React Testing Library..." -ForegroundColor Yellow
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event

Write-Host "📦 Installing jsdom..." -ForegroundColor Yellow
npm install --save-dev jsdom

Write-Host "📦 Installing happy-dom (alternative to jsdom)..." -ForegroundColor Yellow
npm install --save-dev happy-dom

Write-Host ""
Write-Host "✅ All testing dependencies installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Cyan
Write-Host "1. Run tests: npm test" -ForegroundColor White
Write-Host "2. Run tests with UI: npm run test:ui" -ForegroundColor White
Write-Host "3. Run tests with coverage: npm run test:coverage" -ForegroundColor White
Write-Host ""
Write-Host "📚 Check TESTING_GUIDE.md for complete documentation" -ForegroundColor Yellow
Write-Host ""

# Go back to root directory
Set-Location -Path ".."
