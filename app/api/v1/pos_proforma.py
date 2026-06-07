"""POS proforma invoice APIs."""

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.pos_proforma import ProformaExportRequest, ProformaQuoteRequest, ProformaQuoteResponse
from app.services.pos_proforma_service import export_proforma_pdf, export_proforma_xlsx, quote_proforma

router = APIRouter()


@router.post("/pos/proforma/quote", response_model=ProformaQuoteResponse)
async def proforma_quote_endpoint(
    body: ProformaQuoteRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("pos_carts", "read"),
) -> ProformaQuoteResponse:
    return await quote_proforma(db, lines=body.lines)


@router.post("/pos/proforma/export.pdf")
async def proforma_export_pdf_endpoint(
    body: ProformaExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    __: None = require_permission("pos_carts", "read"),
) -> Response:
    content, filename = await export_proforma_pdf(
        db,
        body=body,
        cashier_first_name=current_user.first_name,
        cashier_father_name=current_user.father_name,
        cashier_family_name=current_user.family_name,
        cashier_email=current_user.email,
    )
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/pos/proforma/export.xlsx")
async def proforma_export_xlsx_endpoint(
    body: ProformaExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    __: None = require_permission("pos_carts", "read"),
) -> Response:
    content, filename = await export_proforma_xlsx(
        db,
        body=body,
        cashier_first_name=current_user.first_name,
        cashier_father_name=current_user.father_name,
        cashier_family_name=current_user.family_name,
        cashier_email=current_user.email,
    )
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
