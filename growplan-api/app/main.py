from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth import router as auth_router
from app.api.crops import router as crops_router
from app.api.farms import router as farms_router
from app.api.plans import router as plans_router
from app.config import settings

app = FastAPI(title="GrowPlan API", version="1.0.0")

app.include_router(auth_router)
app.include_router(farms_router)
app.include_router(crops_router)
app.include_router(plans_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(ValueError)
async def validation_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {"code": "VALIDATION_ERROR", "message": str(exc)}
        },
    )


@app.get("/health")
def health_check():
    return {"status": "ok"}
