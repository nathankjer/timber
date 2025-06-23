from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple

import numpy as np

from .units import (
    UnitQuantity,
    acceleration,
    area,
    force,
    format_force,
    format_length,
    format_moment,
    get_unit_manager,
    length,
    moment,
    moment_of_inertia,
    stress,
)


def _to_unit_quantity(val: Any, kind: str) -> UnitQuantity:
    """Convert val to a UnitQuantity of the given kind (length, force, etc)."""
    if isinstance(val, UnitQuantity):
        # Defensive: ensure .value is a float, not a dict
        if isinstance(val.value, dict):
            return UnitQuantity(
                _to_unit_quantity(val.value, kind).value, val.unit_vector
            )
        return val
    if isinstance(val, dict):
        # Try to reconstruct from dict
        if "value" in val and "unit_vector" in val:
            # Recursively extract value if needed
            v = val["value"]
            if isinstance(v, dict):
                v = _to_unit_quantity(v, kind).value
            return UnitQuantity(v, val["unit_vector"])
        # fallback: treat as float
        return _to_unit_quantity(val.get("value", 0.0), kind)
    if kind == "length":
        return length(val)
    if kind == "force":
        return force(val)
    if kind == "moment":
        return moment(val)
    if kind == "stress":
        return stress(val)
    if kind == "area":
        return area(val)
    if kind == "moment_of_inertia":
        return moment_of_inertia(val)
    if kind == "acceleration":
        return acceleration(val)
    return val


@dataclass
class Point:
    """A 3D point with unique ID."""

    id: int
    x: UnitQuantity
    y: UnitQuantity
    z: UnitQuantity = field(default_factory=lambda: length(0.0))

    def __post_init__(self):
        self.x = _to_unit_quantity(self.x, "length")
        self.y = _to_unit_quantity(self.y, "length")
        self.z = _to_unit_quantity(self.z, "length")


@dataclass
class Member:
    """A prismatic beam element between two points."""

    start: int  # Point ID
    end: int  # Point ID
    E: UnitQuantity = field(default_factory=lambda: stress(200e9))
    A: UnitQuantity = field(default_factory=lambda: area(0.01))
    I: UnitQuantity = field(default_factory=lambda: moment_of_inertia(1e-6))

    def __post_init__(self):
        self.E = _to_unit_quantity(self.E, "stress")
        self.A = _to_unit_quantity(self.A, "area")
        self.I = _to_unit_quantity(self.I, "moment_of_inertia")


@dataclass
class Load:
    """Nodal load at a specific point."""

    point: int  # Point ID
    fx: UnitQuantity = field(default_factory=lambda: force(0.0))
    fy: UnitQuantity = field(default_factory=lambda: force(0.0))
    mz: UnitQuantity = field(default_factory=lambda: moment(0.0))
    amount: UnitQuantity = field(default_factory=lambda: force(0.0))

    def __post_init__(self):
        self.fx = _to_unit_quantity(self.fx, "force")
        self.fy = _to_unit_quantity(self.fy, "force")
        self.mz = _to_unit_quantity(self.mz, "moment")
        self.amount = _to_unit_quantity(self.amount, "force")


@dataclass
class Support:
    """Boundary condition at a specific point."""

    point: int  # Point ID
    ux: bool = False
    uy: bool = False
    rz: bool = False


@dataclass
class Model:
    points: List[Point] = field(default_factory=list)
    members: List[Member] = field(default_factory=list)
    loads: List[Load] = field(default_factory=list)
    supports: List[Support] = field(default_factory=list)


@dataclass
class Results:
    displacements: Dict[int, Tuple[float, float, float]]
    reactions: Dict[int, Tuple[float, float, float]]
    unit_system: str = "metric"

    def format_displacement(self, point_id: int, component: str) -> str:
        """Format a displacement component with units."""
        if point_id not in self.displacements:
            return "N/A"

        disp = self.displacements[point_id]
        if component == "ux":
            return format_length(disp[0])
        elif component == "uy":
            return format_length(disp[1])
        elif component == "rz":
            return f"{disp[2]:.6f} rad"
        else:
            return "N/A"

    def format_reaction(self, point_id: int, component: str) -> str:
        """Format a reaction component with units."""
        if point_id not in self.reactions:
            return "N/A"

        react = self.reactions[point_id]
        if component == "fx":
            return format_force(react[0])
        elif component == "fy":
            return format_force(react[1])
        elif component == "mz":
            return format_moment(react[2])
        else:
            return "N/A"


def _local_stiffness(E: float, A: float, I: float, L: float) -> np.ndarray:
    """Return the 6x6 local stiffness matrix for a 2D frame element."""
    k = np.array(
        [
            [A * E / L, 0, 0, -A * E / L, 0, 0],
            [
                0,
                12 * E * I / L**3,
                6 * E * I / L**2,
                0,
                -12 * E * I / L**3,
                6 * E * I / L**2,
            ],
            [
                0,
                6 * E * I / L**2,
                4 * E * I / L,
                0,
                -6 * E * I / L**2,
                2 * E * I / L,
            ],
            [-A * E / L, 0, 0, A * E / L, 0, 0],
            [
                0,
                -12 * E * I / L**3,
                -6 * E * I / L**2,
                0,
                12 * E * I / L**3,
                -6 * E * I / L**2,
            ],
            [
                0,
                6 * E * I / L**2,
                2 * E * I / L,
                0,
                -6 * E * I / L**2,
                4 * E * I / L,
            ],
        ]
    )
    return k


def _transformation(c: float, s: float) -> np.ndarray:
    """Return the 6x6 transformation matrix for 2D."""
    return np.array(
        [
            [c, s, 0, 0, 0, 0],
            [-s, c, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 0, c, s, 0],
            [0, 0, 0, -s, c, 0],
            [0, 0, 0, 0, 0, 1],
        ]
    )


def _assemble_matrices(
    model: Model,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Build global stiffness and load matrices with boundary conditions."""
    n_points = len(model.points)
    dof = n_points * 3
    K_full = np.zeros((dof, dof))
    F_ext = np.zeros(dof)

    # Create mapping from point ID to index
    point_id_to_idx = {p.id: i for i, p in enumerate(model.points)}

    # Apply loads
    for load in model.loads:
        if load.point in point_id_to_idx:
            idx = point_id_to_idx[load.point] * 3
            fx = 0.0 if load.fx is None else float(load.fx.value)
            fy = 0.0 if load.fy is None else float(load.fy.value)
            mz = 0.0 if load.mz is None else float(load.mz.value)
            F_ext[idx] += fx
            F_ext[idx + 1] += fy
            F_ext[idx + 2] += mz

    # Apply member stiffness
    for m in model.members:
        if m.start not in point_id_to_idx or m.end not in point_id_to_idx:
            continue

        start_idx = point_id_to_idx[m.start]
        end_idx = point_id_to_idx[m.end]

        # Get point coordinates
        start_point = model.points[start_idx]
        end_point = model.points[end_idx]

        dx = end_point.x.value - start_point.x.value
        dy = end_point.y.value - start_point.y.value
        L = (dx**2 + dy**2) ** 0.5
        if L == 0:
            continue
        c = dx / L
        s = dy / L
        k_local = _local_stiffness(m.E.value, m.A.value, m.I.value, L)
        T = _transformation(c, s)
        k_global = T.T @ k_local @ T
        dof_map = [
            start_idx * 3,
            start_idx * 3 + 1,
            start_idx * 3 + 2,
            end_idx * 3,
            end_idx * 3 + 1,
            end_idx * 3 + 2,
        ]
        for i_local, gi in enumerate(dof_map):
            for j_local, gj in enumerate(dof_map):
                K_full[gi, gj] += k_global[i_local, j_local]

    K = K_full.copy()
    F = F_ext.copy()

    # Apply boundary conditions
    for sup in model.supports:
        if sup.point in point_id_to_idx:
            base = point_id_to_idx[sup.point] * 3
            if sup.ux:
                K[base, :] = 0
                K[:, base] = 0
                K[base, base] = 1
                F[base] = 0
            if sup.uy:
                idx = base + 1
                K[idx, :] = 0
                K[:, idx] = 0
                K[idx, idx] = 1
                F[idx] = 0
            if sup.rz:
                idx = base + 2
                K[idx, :] = 0
                K[:, idx] = 0
                K[idx, idx] = 1
                F[idx] = 0

    return K_full, F_ext, K, F


def solve(model: Model) -> Results:
    """Solve for nodal displacements and reactions."""
    K_full, F_ext, K, F = _assemble_matrices(model)

    # Solve
    try:
        d = np.linalg.solve(K, F)
    except np.linalg.LinAlgError:
        d = np.linalg.lstsq(K, F, rcond=None)[0]

    # Reactions
    reactions_vec = K_full @ d - F_ext
    displacements: Dict[int, Tuple[float, float, float]] = {}
    reactions: Dict[int, Tuple[float, float, float]] = {}

    for i, point in enumerate(model.points):
        displacements[point.id] = (d[i * 3], d[i * 3 + 1], d[i * 3 + 2])
        reactions[point.id] = (
            reactions_vec[i * 3],
            reactions_vec[i * 3 + 1],
            reactions_vec[i * 3 + 2],
        )

    unit_manager = get_unit_manager()
    return Results(
        displacements=displacements,
        reactions=reactions,
        unit_system=unit_manager.system,
    )


def solve_with_diagnostics(model: Model) -> tuple[Results, List[str]]:
    """Solve the model and return potential issues found."""
    K_full, F_ext, K, F = _assemble_matrices(model)

    # Handle empty model case
    if K.size == 0:
        return Results(
            displacements={}, reactions={}, unit_system=get_unit_manager().system
        ), ["No elements defined."]

    try:
        d = np.linalg.solve(K, F)
        singular = False
    except np.linalg.LinAlgError:
        d = np.linalg.lstsq(K, F, rcond=None)[0]
        singular = True

    reactions_vec = K_full @ d - F_ext
    displacements: Dict[int, Tuple[float, float, float]] = {}
    reactions: Dict[int, Tuple[float, float, float]] = {}

    for i, point in enumerate(model.points):
        displacements[point.id] = (d[i * 3], d[i * 3 + 1], d[i * 3 + 2])
        reactions[point.id] = (
            reactions_vec[i * 3],
            reactions_vec[i * 3 + 1],
            reactions_vec[i * 3 + 2],
        )

    unit_manager = get_unit_manager()
    res = Results(
        displacements=displacements,
        reactions=reactions,
        unit_system=unit_manager.system,
    )

    issues: List[str] = []
    if singular or np.linalg.matrix_rank(K) < K.shape[0]:
        issues.append("The structure may be unstable or insufficiently constrained.")

    max_disp = float(np.max(np.abs(d))) if d.size else 0.0
    if max_disp > 1e6:
        issues.append("Very large displacements detected.")

    if not model.supports:
        issues.append("No supports defined.")

    for m in model.members:
        if m.start not in [p.id for p in model.points] or m.end not in [
            p.id for p in model.points
        ]:
            issues.append("Member references non-existent point.")
            continue

        start_point = next(p for p in model.points if p.id == m.start)
        end_point = next(p for p in model.points if p.id == m.end)

        dx = end_point.x.value - start_point.x.value
        dy = end_point.y.value - start_point.y.value
        if np.isclose(dx, 0) and np.isclose(dy, 0):
            issues.append(f"Member at point {m.start} has zero length.")
            break

    return res, issues
