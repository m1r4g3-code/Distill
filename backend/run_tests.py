import pytest
import sys

if __name__ == "__main__":
    import sys
    
    # Run both unit and integration tests
    print("Running Unit Tests (Mocked)...")
    unit_result = pytest.main(["-v", "tests/test_main.py"])
    
    print("\nRunning Integration Tests (Real Database/Internet)...")
    integration_result = pytest.main(["-v", "tests/integration_test.py"])
    
    if unit_result != 0 or integration_result != 0:
        sys.exit(1)
    sys.exit(0)
