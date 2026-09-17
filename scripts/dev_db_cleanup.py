"""Clean E2E/test leftovers from the local development database.

Repeated E2E runs leave one data source (and its import batches, raw rows,
customers, orders) behind per run. This script deletes everything hanging off
test-pattern data sources (e2e_/bi_/cockpit_/sw_/assign_) in one transaction,
keeping real business sources (e.g. the original Jingdouyun import) untouched.

Safety:
- Refuses to run unless APP_ENV=development and the database is local.
- Dry-run by default; pass --yes to actually delete.
- Prints per-table row counts before committing.
"""

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[1]

# 测试数据源编码前缀（与 E2E/看版用例的命名约定一一对应）。
TEST_PATTERNS = ["e2e\\_%", "bi\\_%", "cockpit\\_%", "sw\\_%", "assign\\_%"]


def source_condition(alias: str = "") -> str:
    prefix = f"{alias}." if alias else ""
    return " OR ".join(f"{prefix}source_system LIKE :p{i} ESCAPE '\\'" for i in range(len(TEST_PATTERNS)))


def source_code_condition(alias: str) -> str:
    return " OR ".join(f"{alias}.source_code LIKE :p{i} ESCAPE '\\'" for i in range(len(TEST_PATTERNS)))


PARAMS = {f"p{i}": pattern for i, pattern in enumerate(TEST_PATTERNS)}


def guard() -> None:
    load_dotenv(ROOT / ".env")
    if os.environ.get("APP_ENV") != "development":
        sys.exit(f"拒绝运行：APP_ENV={os.environ.get('APP_ENV') or '(未设置)'}，仅 development 环境允许清理")
    url = os.environ.get("DATABASE_URL", "")
    if "127.0.0.1" not in url and "localhost" not in url:
        sys.exit("拒绝运行：DATABASE_URL 不是本机数据库")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--yes", action="store_true", help="实际执行删除（默认 dry-run）")
    parser.add_argument("--keep-uploads", action="store_true", help="保留已删除批次的上传文件")
    args = parser.parse_args()
    guard()

    engine = create_engine(os.environ["DATABASE_URL"])
    cust = source_condition("c")
    order = source_condition("s")
    prod = source_condition("p")
    src_code = source_code_condition("d")

    steps = [
        ("crm_task", f"customer_id IN (SELECT id FROM customer c WHERE {cust}) OR followup_id IN (SELECT f.id FROM crm_followup f JOIN customer c ON c.id=f.customer_id WHERE {cust})"),
        ("crm_followup", f"customer_id IN (SELECT id FROM customer c WHERE {cust})"),
        ("customer_claim", f"customer_id IN (SELECT id FROM customer c WHERE {cust})"),
        ("customer_assignment_history", f"customer_id IN (SELECT id FROM customer c WHERE {cust})"),
        ("customer_tag_map", f"customer_id IN (SELECT id FROM customer c WHERE {cust})"),
        ("crm_contact", f"customer_id IN (SELECT id FROM customer c WHERE {cust})"),
        ("crm_opportunity_product", f"product_id IN (SELECT id FROM product p WHERE {prod})"),
        ("crm_opportunity", f"customer_id IN (SELECT id FROM customer c WHERE {cust})"),
        ("sales_order_line", f"sales_order_id IN (SELECT s.id FROM sales_order s WHERE {order})"),
        ("sales_order", source_condition()),
        ("product", source_condition()),
        ("customer", source_condition()),
        ("financial_metric_monthly", f"import_batch_id IN (SELECT b.id FROM import_batch b JOIN data_source d ON d.id=b.data_source_id WHERE {src_code})"),
        ("financial_period", f"data_source_id IN (SELECT id FROM data_source d WHERE {src_code})"),
        ("sales_review", f"source_id IN (SELECT id FROM data_source d WHERE {src_code})"),
        ("raw_import_row", f"import_batch_id IN (SELECT b.id FROM import_batch b JOIN data_source d ON d.id=b.data_source_id WHERE {src_code})"),
        ("import_batch", f"data_source_id IN (SELECT id FROM data_source d WHERE {src_code})"),
        ("field_mapping", f"data_source_id IN (SELECT id FROM data_source d WHERE {src_code})"),
        ("data_source", f"id IN (SELECT id FROM data_source d WHERE {src_code})"),
    ]

    uploads: list[str] = []
    with engine.begin() as conn:
        if not args.keep_uploads:
            rows = conn.execute(text(
                f"SELECT storage_path FROM import_batch b JOIN data_source d ON d.id=b.data_source_id WHERE {src_code}"),
                PARAMS).scalars().all()
            uploads = [r for r in rows if r]
        print(f"{'dry-run' if not args.yes else 'DELETE'} 计划：")
        for table, where in steps:
            count = conn.execute(text(f"SELECT count(*) FROM {table} WHERE {where}"), PARAMS).scalar()
            print(f"  {table}: {count}")
            if args.yes:
                conn.execute(text(f"DELETE FROM {table} WHERE {where}"), PARAMS)
        if args.yes:
            print("已提交事务。")
        else:
            print("dry-run 未改动任何数据；确认无误后加 --yes 执行。")

    if args.yes and uploads and not args.keep_uploads:
        upload_root = (ROOT / "app-data/uploads").resolve()
        removed = missing = outside = 0
        for raw in uploads:
            path = (ROOT / raw).resolve() if not os.path.isabs(raw) else Path(raw).resolve()
            if upload_root not in path.parents:
                outside += 1
                continue
            if path.exists():
                path.unlink()
                removed += 1
            else:
                missing += 1
        print(f"上传文件：删除 {removed}，缺失 {missing}，超出 uploads 目录跳过 {outside}。")


if __name__ == "__main__":
    main()
