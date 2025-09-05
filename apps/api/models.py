from typing import Optional, List, Literal
from pydantic import BaseModel, Field

ChartMode = Literal["tier", "single_axis", "two_axis"]
Visibility = Literal["public", "unlisted", "private"]
Axis = Literal["x", "y"]

class CreateChartRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    mode: ChartMode
    x_label: Optional[str] = Field(None, max_length=100)
    y_label: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    creator_take: Optional[str] = Field(None, max_length=1000)
    voting_period_days: Optional[int] = Field(None, ge=1, le=365)
    visibility: Visibility = "public"
    task_description: Optional[str] = Field(None, max_length=1000)
    task_image_url: Optional[str] = Field(None, max_length=500)
    tool_name: Optional[str] = Field("OpenEvidence", max_length=100)
    upload_images: Optional[str] = Field(None, max_length=1000)

class CreateChartResponse(BaseModel):
    id: str
    admin_url: str
    share_url: str

class AddItemsRequest(BaseModel):
    items: List[dict] = Field(..., min_items=1, max_items=100)

class PairVoteRequest(BaseModel):
    chart_id: str
    axis: Optional[Axis] = None
    item_a: str
    item_b: str
    winner: str

class ExplicitVoteRequest(BaseModel):
    chart_id: str
    item_id: str
    tier: Optional[int] = Field(None, ge=1, le=4)
    x: Optional[float] = Field(None, ge=-100, le=100)
    y: Optional[float] = Field(None, ge=-100, le=100)

class Item(BaseModel):
    id: str
    label: str
    r_x: Optional[float] = None
    r_y: Optional[float] = None
    x_mu: Optional[float] = None
    y_mu: Optional[float] = None
    tier_mu: Optional[float] = None

class PublicChartResponse(BaseModel):
    title: str
    mode: ChartMode
    x_label: Optional[str] = None
    y_label: Optional[str] = None
    description: Optional[str] = None
    creator_take: Optional[str] = None
    items: List[Item]

class ChartSummary(BaseModel):
    id: str
    title: str
    mode: ChartMode
    item_count: int
    vote_count: int
    created_at: str

class AISuggestionRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    mode: ChartMode
    type: Literal["items", "axes"]

class AISuggestionResponse(BaseModel):
    items: Optional[List[str]] = None
    axes: Optional[List[dict]] = None

class FeedbackRequest(BaseModel):
    chart_id: str
    tool_helpfulness: int = Field(..., ge=1, le=5)
    free_response: Optional[str] = Field(None, max_length=2000)