"""add usage reports

Revision ID: d26f225a8890
Revises: 338b4a381852

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd26f225a8890'
down_revision: Union[str, Sequence[str], None] = '338b4a381852'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the usage_reports and usage_pokemon tables."""
    op.create_table('usage_reports',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('format', sa.String(length=64), nullable=False),
    sa.Column('month', sa.String(length=7), nullable=False),
    sa.Column('rating', sa.Integer(), nullable=False),
    sa.Column('battles', sa.Integer(), nullable=False),
    sa.Column('loaded_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('format', 'month', 'rating')
    )
    with op.batch_alter_table('usage_reports', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_usage_reports_format'), ['format'], unique=False)

    op.create_table('usage_pokemon',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('report_id', sa.Integer(), nullable=False),
    sa.Column('rank', sa.Integer(), nullable=False),
    sa.Column('species', sa.String(length=64), nullable=False),
    sa.Column('usage', sa.Float(), nullable=False),
    sa.Column('sets', sa.JSON(), nullable=False),
    sa.ForeignKeyConstraint(['report_id'], ['usage_reports.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('report_id', 'species')
    )
    with op.batch_alter_table('usage_pokemon', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_usage_pokemon_report_id'), ['report_id'], unique=False)



def downgrade() -> None:
    """Drop the usage tables."""
    with op.batch_alter_table('usage_pokemon', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_usage_pokemon_report_id'))

    op.drop_table('usage_pokemon')
    with op.batch_alter_table('usage_reports', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_usage_reports_format'))

    op.drop_table('usage_reports')
