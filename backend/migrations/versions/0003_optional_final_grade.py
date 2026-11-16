"""Optional exact final grade on requests; existing rows remain null."""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cert_requests", sa.Column("final_grade", sa.Numeric(4, 2), nullable=True))
    op.create_check_constraint("ck_cert_requests_final_grade", "cert_requests",
                               "final_grade >= 0 AND final_grade <= 10")


def downgrade() -> None:
    op.drop_constraint("ck_cert_requests_final_grade", "cert_requests", type_="check")
    op.drop_column("cert_requests", "final_grade")
