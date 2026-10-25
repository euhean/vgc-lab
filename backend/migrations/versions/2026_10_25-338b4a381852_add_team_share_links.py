"""add team share links

Revision ID: 338b4a381852
Revises: 5c114781b2b1

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '338b4a381852'
down_revision: Union[str, Sequence[str], None] = '5c114781b2b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the share_id column to teams."""
    with op.batch_alter_table('teams', schema=None) as batch_op:
        batch_op.add_column(sa.Column('share_id', sa.String(length=16), nullable=True))
        batch_op.create_index(batch_op.f('ix_teams_share_id'), ['share_id'], unique=True)


def downgrade() -> None:
    """Remove the share_id column from teams."""
    with op.batch_alter_table('teams', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_teams_share_id'))
        batch_op.drop_column('share_id')

