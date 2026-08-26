from fastapi import APIRouter, Depends

from app.deps import get_repo_dep
from engine.data import DataRepo
from engine.models import HazardScore, ResilienceRequest, ResilienceResponse
from engine.resilience import assess

router = APIRouter()


@router.post("/resilience", response_model=ResilienceResponse)
def resilience(req: ResilienceRequest,
               repo: DataRepo = Depends(get_repo_dep)) -> ResilienceResponse:
    r = assess(req.zip_code, req.building_type.value, req.portfolio, repo)
    return ResilienceResponse(
        county_fips=r.county_fips,
        county_name=r.county_name,
        state=r.state,
        overall_before=r.overall_before,
        overall_after=r.overall_after,
        hazards=[HazardScore(**row) for row in r.hazards],
    )