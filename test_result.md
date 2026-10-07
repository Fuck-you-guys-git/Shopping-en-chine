#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: "Paxity v2 widget checkout (Wave / Orange Money in XOF, card in EUR/USD) plus cash on delivery. Catalog moved to the backend; the server prices every order."

backend:
  - task: "Catalog API (GET /api/products) seeded from backend/data/products.json"
    implemented: true
    working: true
    file: "/app/backend/catalog.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "backend/tests/test_catalog.py"

  - task: "Orders priced server-side (POST /api/orders), shipping methods, payment method/currency rules"
    implemented: true
    working: true
    file: "/app/backend/orders.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "backend/tests/test_orders.py, backend/tests/test_payments.py"

frontend:
  - task: "Checkout: Wave/OM (XOF) and card (EUR/USD) via Paxity widget, cash on delivery"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/Checkout.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Verified with a stand-in widget (real paxity.js unreachable from the test sandbox): mount options, success, failure, cash on delivery. Needs a real Paxity test payment."

metadata:
  created_by: "main_agent"
  version: "3.0"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Checkout: Wave/OM (XOF) and card (EUR/USD) via Paxity widget, cash on delivery"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"
