"""Try the analysis from the terminal without the web server.

    python try_analysis.py "Your package is on hold. Pay the $1.99 fee: bit.ly/abc123"
"""
import json
import sys

from dotenv import load_dotenv

load_dotenv()

from analysis import analyze_message  # noqa: E402  (load .env first)

message = " ".join(sys.argv[1:]) or input("Paste a message: ")
print(json.dumps(analyze_message(message), indent=2))
