from pydantic import BaseModel, ConfigDict, Field


class ErrorDetail(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    code: str
    message: str


class ErrorResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    error: ErrorDetail
