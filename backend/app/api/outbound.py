from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.services.outbound_service import (
    OutboundQueryError,
    OutboundValidationError,
    get_outbound_by_key,
    list_outbound,
)


router = APIRouter(
    prefix="/outbound",
    tags=["outbound"],
    dependencies=[Depends(get_current_user)],
)


def query_params_to_dict(request: Request) -> dict[str, str]:
    return {key: value for key, value in request.query_params.multi_items()}


@router.get("/{model_name}")
def list_outbound_records(
    model_name: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    include_meta: bool = False,
    include_raw: bool = False,
) -> dict[str, Any]:
    try:
        return list_outbound(
            db,
            model_name=model_name,
            query_params=query_params_to_dict(request),
            endpoint=request.url.path,
            limit=limit,
            offset=offset,
            include_meta=include_meta,
            include_raw=include_raw,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except OutboundValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors,
        ) from exc
    except OutboundQueryError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.get("/{model_name}/{key}")
def get_outbound_record_by_key(
    model_name: str,
    key: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    include_meta: bool = False,
    include_raw: bool = False,
) -> dict[str, Any]:
    try:
        return get_outbound_by_key(
            db,
            model_name=model_name,
            key=key,
            query_params=query_params_to_dict(request),
            endpoint=request.url.path,
            include_meta=include_meta,
            include_raw=include_raw,
        )
    except LookupError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if detail == "Record not found" or detail == "Data model not found" else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=detail) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except OutboundValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors,
        ) from exc
    except OutboundQueryError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

