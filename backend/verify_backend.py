#!/usr/bin/env python3
"""
Backend Verification Script

This script verifies that all backend components are working correctly:
- Environment variables are loaded
- Configuration is valid
- Services can be initialized
- API endpoints are accessible
"""

import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=str(env_path))
else:
    load_dotenv()

# Add backend to path
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

def check_environment_variables():
    """Check if all required environment variables are set"""
    print("=" * 60)
    print("🔍 Checking Environment Variables...")
    print("=" * 60)
    
    required_vars = [
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_SECRET",
        "LIVEKIT_URL",
        "DEEPGRAM_API_KEY",
        "ELEVENLABS_API_KEY",
        "GOOGLE_API_KEY",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
    ]
    
    optional_vars = [
        "SMTP_HOST",
        "SMTP_USER",
        "TAVUS_API_KEY",
    ]
    
    missing_required = []
    missing_optional = []
    
    for var in required_vars:
        value = os.getenv(var)
        if value:
            # Mask sensitive values
            masked = value[:8] + "..." + value[-4:] if len(value) > 12 else "***"
            print(f"  ✅ {var}: {masked}")
        else:
            print(f"  ❌ {var}: MISSING")
            missing_required.append(var)
    
    print("\n  Optional Variables:")
    for var in optional_vars:
        value = os.getenv(var)
        if value:
            masked = value[:8] + "..." + value[-4:] if len(value) > 12 else "***"
            print(f"  ✅ {var}: {masked}")
        else:
            print(f"  ⚠️  {var}: Not set (optional)")
            missing_optional.append(var)
    
    if missing_required:
        print(f"\n  ❌ ERROR: Missing {len(missing_required)} required variables!")
        return False
    
    print(f"\n  ✅ All required environment variables are set!")
    return True


def check_configuration():
    """Check if configuration can be loaded"""
    print("\n" + "=" * 60)
    print("🔍 Checking Configuration...")
    print("=" * 60)
    
    try:
        from app.config import get_config
        config = get_config()
        
        print(f"  ✅ LiveKit Agent Name: {config.livekit.agent_name}")
        print(f"  ✅ LiveKit URL: {config.livekit.url}")
        print(f"  ✅ Deepgram Model: {config.deepgram.model}")
        print(f"  ✅ ElevenLabs Model: {config.elevenlabs.model}")
        print(f"  ✅ Google LLM Model: {config.google_llm.model}")
        print(f"  ✅ Supabase URL: {config.supabase.url}")
        print(f"  ✅ Server Host: {config.server.host}")
        print(f"  ✅ Server Port: {config.server.port}")
        print(f"  ✅ Frontend URL: {config.server.frontend_url}")
        
        if config.smtp.host:
            print(f"  ✅ SMTP Configured: {config.smtp.host}:{config.smtp.port}")
        else:
            print(f"  ⚠️  SMTP: Not configured (optional)")
        
        if config.tavus.api_key:
            print(f"  ✅ Tavus Avatar: Configured")
        else:
            print(f"  ⚠️  Tavus Avatar: Not configured (optional)")
        
        print(f"\n  ✅ Configuration loaded successfully!")
        return True, config
        
    except Exception as e:
        print(f"  ❌ ERROR: Failed to load configuration: {e}")
        import traceback
        traceback.print_exc()
        return False, None


def check_services():
    """Check if services can be initialized"""
    print("\n" + "=" * 60)
    print("🔍 Checking Services...")
    print("=" * 60)
    
    try:
        from app.config import get_config
        config = get_config()
        
        # Check Resume Service
        try:
            from app.services.resume_service import ResumeService
            resume_service = ResumeService(config)
            print("  ✅ ResumeService: Initialized")
        except Exception as e:
            print(f"  ❌ ResumeService: Failed - {e}")
            return False
        
        # Check Booking Service
        try:
            from app.services.booking_service import BookingService
            booking_service = BookingService(config)
            print("  ✅ BookingService: Initialized")
        except Exception as e:
            print(f"  ❌ BookingService: Failed - {e}")
            return False
        
        # Check Email Service
        try:
            from app.services.email_service import EmailService
            email_service = EmailService(config)
            print("  ✅ EmailService: Initialized")
        except Exception as e:
            print(f"  ❌ EmailService: Failed - {e}")
            return False
        
        print(f"\n  ✅ All services initialized successfully!")
        return True
        
    except Exception as e:
        print(f"  ❌ ERROR: Service initialization failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def check_api_endpoints():
    """Check if API can be imported and app created"""
    print("\n" + "=" * 60)
    print("🔍 Checking API Endpoints...")
    print("=" * 60)
    
    try:
        from app.api.main import app
        
        # Get all routes
        routes = []
        for route in app.routes:
            if hasattr(route, 'methods') and hasattr(route, 'path'):
                methods = ', '.join(route.methods) if route.methods else 'GET'
                routes.append(f"{methods:8} {route.path}")
        
        print("  Available Endpoints:")
        for route in sorted(routes):
            print(f"    ✅ {route}")
        
        # Check for healthz endpoint
        has_healthz = any('/healthz' in route for route in routes)
        if has_healthz:
            print(f"\n  ✅ Health check endpoint (/healthz) available")
        else:
            print(f"\n  ⚠️  Health check endpoint (/healthz) not found")
        
        print(f"\n  ✅ API application created successfully!")
        return True
        
    except Exception as e:
        print(f"  ❌ ERROR: Failed to create API application: {e}")
        import traceback
        traceback.print_exc()
        return False


def check_dependencies():
    """Check if all required Python packages are installed"""
    print("\n" + "=" * 60)
    print("🔍 Checking Dependencies...")
    print("=" * 60)
    
    required_packages = [
        "fastapi",
        "uvicorn",
        "livekit",
        "livekit.agents",
        "pydantic",
        "python-dotenv",
        "supabase",
    ]
    
    missing = []
    for package in required_packages:
        try:
            __import__(package.replace(".", "_") if "." in package else package)
            print(f"  ✅ {package}")
        except ImportError:
            print(f"  ❌ {package}: NOT INSTALLED")
            missing.append(package)
    
    if missing:
        print(f"\n  ❌ ERROR: Missing {len(missing)} packages!")
        print(f"  Run: pip install -r requirements.txt")
        return False
    
    print(f"\n  ✅ All required packages are installed!")
    return True


def main():
    """Run all verification checks"""
    print("\n" + "=" * 60)
    print("🚀 BACKEND VERIFICATION SCRIPT")
    print("=" * 60)
    print()
    
    results = []
    
    # Run all checks
    results.append(("Environment Variables", check_environment_variables()))
    results.append(("Dependencies", check_dependencies()))
    
    config_result, config = check_configuration()
    results.append(("Configuration", config_result))
    
    if config_result:
        results.append(("Services", check_services()))
        results.append(("API Endpoints", check_api_endpoints()))
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 VERIFICATION SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {name}")
    
    print(f"\n  Results: {passed}/{total} checks passed")
    
    if passed == total:
        print("\n  🎉 ALL CHECKS PASSED! Backend is ready to run.")
        return 0
    else:
        print(f"\n  ⚠️  {total - passed} check(s) failed. Please fix the issues above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())

