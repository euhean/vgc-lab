"""Writes the API's OpenAPI schema to a file: python -m scripts.export_openapi <path>.

The frontend generates its TypeScript API types from this file.
"""
import json
import os
import sys

# Building the schema needs no database or real secret; these values only satisfy the settings.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "schema-export-only"

from app.main import app  # noqa: E402

with open(sys.argv[1], "w") as f:
    json.dump(app.openapi(), f, indent=2)
    f.write("\n")
