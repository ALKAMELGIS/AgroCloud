"""SQLite persistence for dataset → geometry (1) → many telemetry rows (N)."""
from sqlalchemy import ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker


class Base(DeclarativeBase):
    pass


class Dataset(Base):
    __tablename__ = "datasets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(512))
    source_kind: Mapped[str] = mapped_column(String(64))  # csv, shp, kmz, ...
    created_at: Mapped[str] = mapped_column(String(64))

    features: Mapped[list["SpatialFeature"]] = relationship(back_populates="dataset")
    records: Mapped[list["TelemetryRecord"]] = relationship(back_populates="dataset")


class SpatialFeature(Base):
    """One polygon / line / point row linked to a dataset (e.g. field boundary from Shapefile)."""
    __tablename__ = "spatial_features"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id"))
    external_key: Mapped[str] = mapped_column(String(256), default="")  # field id from source
    geom_wkt: Mapped[str] = mapped_column(Text, default="")  # store WKT until PostGIS migration

    dataset: Mapped[Dataset] = relationship(back_populates="features")
    records: Mapped[list["TelemetryRecord"]] = relationship(back_populates="feature")


class TelemetryRecord(Base):
    """Many agronomic / logistics rows per spatial feature (one-to-many)."""
    __tablename__ = "telemetry_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id"))
    feature_id: Mapped[int | None] = mapped_column(ForeignKey("spatial_features.id"), nullable=True)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")

    dataset: Mapped[Dataset] = relationship(back_populates="records")
    feature: Mapped[SpatialFeature | None] = relationship(back_populates="records")


class DashboardBinding(Base):
    """Links one map / registry entity key to many dashboard chart widget ids (JSON array)."""
    __tablename__ = "dashboard_bindings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scope: Mapped[str] = mapped_column(String(128), default="agro-dashboard")
    map_entity_key: Mapped[str] = mapped_column(String(512))
    chart_widget_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    updated_at: Mapped[str] = mapped_column(String(64), default="")


def get_engine(db_path: str = "./geodash.sqlite"):
    return create_engine(f"sqlite:///{db_path}", echo=False, future=True)


def get_session_factory(db_path: str = "./geodash.sqlite"):
    engine = get_engine(db_path)
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)
