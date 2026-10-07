import os, sys
from datetime import datetime, timezone
from pymongo import MongoClient
from dotenv import dotenv_values

env = dotenv_values("/app/backend/.env")
mongo_url = env.get("MONGO_URL")
db_name = env.get("DB_NAME")
c = MongoClient(mongo_url)
db = c[db_name]
now = datetime.now(timezone.utc).isoformat()
action = sys.argv[1] if len(sys.argv) > 1 else "seed"
if action == "cleanup":
    db.orders.delete_one({"id":"qa_tab_1"})
    db.paxity_transactions.delete_one({"id":"tx_qa_tab_1"})
    print("cleaned")
else:
    api = env.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")
    db.orders.delete_one({"id":"qa_tab_1"})
    db.paxity_transactions.delete_one({"id":"tx_qa_tab_1"})
    db.orders.insert_one({
        "id":"qa_tab_1",
        "customer":{"name":"QA Tab","email":"commands@shoppingenchine.com","city":"Dakar","phone":"+221700000000","address":"Test"},
        "items":[{"product_id":"x","name":"Article Tab QA","price":9000,"qty":1}],
        "amount":9000,"currency":"XOF","status":"pending","payment_method":"WAVESN",
        "delivery_mode":"standard","created_at":now
    })
    db.paxity_transactions.insert_one({
        "id":"tx_qa_tab_1","order_id":"qa_tab_1","amount":9000,"currency":"XOF",
        "payment_method":"WAVESN","status":"pending","paxity_transaction_id":"qa_paxid_tab_1",
        "payment_link": f"{api}/mentions","created_at":now,"updated_at":now
    })
    print("seeded", api)
