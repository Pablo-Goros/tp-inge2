"""outbox: unique request_id and partial index on unpublished rows

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint('uq_outbox_request_id', 'outbox', ['request_id'])
    op.create_index('ix_outbox_unpublished', 'outbox', ['published_at'], unique=False,
                    postgresql_where=sa.text('published_at IS NULL'))


def downgrade() -> None:
    op.drop_index('ix_outbox_unpublished', table_name='outbox', postgresql_where=sa.text('published_at IS NULL'))
    op.drop_constraint('uq_outbox_request_id', 'outbox', type_='unique')
