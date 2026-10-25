from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_, select

from app.config import settings
from app.deps import DB, CurrentUser
from app.models import User
from app.rate_limit import RateLimiter
from app.schemas import LoginRequest, Token, UserCreate, UserOut
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

login_limiter = RateLimiter(limit=settings.login_attempts_per_minute, window=60)


def limit_login_attempts(request: Request) -> None:
    """Slows down password guessing: too many login attempts from one IP get a 429."""
    ip = request.client.host if request.client else "unknown"
    if not login_limiter.hit(ip):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many login attempts, try again later",
            headers={"Retry-After": str(login_limiter.retry_after(ip))},
        )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: DB) -> User:
    taken = db.scalar(select(User).where(or_(User.username == data.username, User.email == data.email)))
    if taken:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username or email already registered")
    user = User(username=data.username, email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token, dependencies=[Depends(limit_login_attempts)])
def login(data: LoginRequest, db: DB) -> Token:
    user = db.scalar(select(User).where(or_(User.username == data.login, User.email == data.login)))
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username/email or password")
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
