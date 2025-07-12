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
    J: UnitQuantity = field(default_factory=lambda: moment_of_inertia(1e-6))
    G: UnitQuantity = field(default_factory=lambda: stress(75e9))

    def __post_init__(self):
        self.E = _to_unit_quantity(self.E, "stress")
        self.A = _to_unit_quantity(self.A, "area")
        self.I = _to_unit_quantity(self.I, "moment_of_inertia")
        self.J = _to_unit_quantity(self.J, "moment_of_inertia")
        self.G = _to_unit_quantity(self.G, "stress")


@dataclass
class Load:
    """Nodal load at a specific point."""

    point: int  # Point ID
    fx: UnitQuantity = field(default_factory=lambda: force(0.0))
    fy: UnitQuantity = field(default_factory=lambda: force(0.0))
    fz: UnitQuantity = field(default_factory=lambda: force(0.0))
    mx: UnitQuantity = field(default_factory=lambda: moment(0.0))
    my: UnitQuantity = field(default_factory=lambda: moment(0.0))
    mz: UnitQuantity = field(default_factory=lambda: moment(0.0))
    amount: UnitQuantity = field(default_factory=lambda: force(0.0))
    is_gravity_load: bool = False

    def __post_init__(self):
        self.fx = _to_unit_quantity(self.fx, "force")
        self.fy = _to_unit_quantity(self.fy, "force")
        self.fz = _to_unit_quantity(self.fz, "force")
        self.mx = _to_unit_quantity(self.mx, "moment")
        self.my = _to_unit_quantity(self.my, "moment")
        self.mz = _to_unit_quantity(self.mz, "moment")
        self.amount = _to_unit_quantity(self.amount, "force")


@dataclass
class Support:
    """Boundary condition at a specific point."""

    point: int  # Point ID
    ux: bool = False
    uy: bool = False
    uz: bool = False
    rx: bool = False
    ry: bool = False
    rz: bool = False


@dataclass
class Model:
    points: List[Point] = field(default_factory=list)
    members: List[Member] = field(default_factory=list)
    loads: List[Load] = field(default_factory=list)
    supports: List[Support] = field(default_factory=list)


@dataclass
class Results:
    displacements: Dict[int, Tuple[float, float, float, float, float, float]]
    reactions: Dict[int, Tuple[float, float, float, float, float, float]]
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
        elif component == "uz":
            return format_length(disp[2])
        elif component == "rx":
            return f"{disp[3]:.6f} rad"
        elif component == "ry":
            return f"{disp[4]:.6f} rad"
        elif component == "rz":
            return f"{disp[5]:.6f} rad"
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
        elif component == "fz":
            return format_force(react[2])
        elif component == "mx":
            return format_moment(react[3])
        elif component == "my":
            return format_moment(react[4])
        elif component == "mz":
            return format_moment(react[5])
        else:
            return "N/A"


def _local_stiffness(
    E: float, A: float, Iz: float, Iy: float, G: float, J: float, L: float
) -> np.ndarray:
    """Return the 12x12 local stiffness matrix for a 3D frame element."""
    k = np.zeros((12, 12))
    k[0, 0] = k[6, 6] = A * E / L
    k[0, 6] = k[6, 0] = -A * E / L

    k[1, 1] = k[7, 7] = 12 * E * Iz / L**3
    k[1, 7] = k[7, 1] = -12 * E * Iz / L**3
    k[1, 5] = k[5, 1] = k[1, 11] = k[11, 1] = 6 * E * Iz / L**2
    k[1, 5] = k[5, 1] = 6 * E * Iz / L**2
    k[1, 11] = k[11, 1] = 6 * E * Iz / L**2
    k[7, 5] = k[5, 7] = k[7, 11] = k[11, 7] = -6 * E * Iz / L**2

    k[2, 2] = k[8, 8] = 12 * E * Iy / L**3
    k[2, 8] = k[8, 2] = -12 * E * Iy / L**3
    k[2, 4] = k[4, 2] = -6 * E * Iy / L**2
    k[2, 10] = k[10, 2] = -6 * E * Iy / L**2
    k[8, 4] = k[4, 8] = 6 * E * Iy / L**2
    k[8, 10] = k[10, 8] = 6 * E * Iy / L**2

    k[3, 3] = k[9, 9] = G * J / L
    k[3, 9] = k[9, 3] = -G * J / L

    k[4, 4] = k[10, 10] = 4 * E * Iy / L
    k[4, 10] = k[10, 4] = 2 * E * Iy / L

    k[5, 5] = k[11, 11] = 4 * E * Iz / L
    k[5, 11] = k[11, 5] = 2 * E * Iz / L
    return k


def _transformation(c: float, s: float) -> np.ndarray:
    """Return the 12x12 transformation matrix for 3D."""
    # This is a simplified transformation matrix that assumes one of the
    # principal axes of the member is aligned with the global Z-axis.
    # A full 3D implementation would require a third vector to define orientation.
    R = np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
    T = np.zeros((12, 12))
    T[0:3, 0:3] = R
    T[3:6, 3:6] = R
    T[6:9, 6:9] = R
    T[9:12, 9:12] = R
    return T


def _assemble_matrices(
    model: Model,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Build global stiffness and load matrices with boundary conditions."""
    n_points = len(model.points)
    dof = n_points * 6
    K_full = np.zeros((dof, dof))
    F_ext = np.zeros(dof)

    # Create mapping from point ID to index
    point_id_to_idx = {p.id: i for i, p in enumerate(model.points)}

    # Apply loads
    for load in model.loads:
        if load.point in point_id_to_idx:
            idx = point_id_to_idx[load.point] * 6
            F_ext[idx] += float(load.fx.value)
            F_ext[idx + 1] += float(load.fy.value)
            F_ext[idx + 2] += float(load.fz.value)
            F_ext[idx + 3] += float(load.mx.value)
            F_ext[idx + 4] += float(load.my.value)
            F_ext[idx + 5] += float(load.mz.value)

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
        dz = end_point.z.value - start_point.z.value
        L = (dx**2 + dy**2 + dz**2) ** 0.5
        if L == 0:
            continue
        c = dx / L
        s = dy / L
        # For simplicity, this solver assumes members are oriented in the XY plane.
        # A full 3D solver would require more complex transformations.
        k_local = _local_stiffness(
            m.E.value, m.A.value, m.I.value, m.I.value, m.G.value, m.J.value, L
        )
        T = _transformation(c, s)
        k_global = T.T @ k_local @ T
        dof_map = [
            start_idx * 6,
            start_idx * 6 + 1,
            start_idx * 6 + 2,
            start_idx * 6 + 3,
            start_idx * 6 + 4,
            start_idx * 6 + 5,
            end_idx * 6,
            end_idx * 6 + 1,
            end_idx * 6 + 2,
            end_idx * 6 + 3,
            end_idx * 6 + 4,
            end_idx * 6 + 5,
        ]
        for i_local, gi in enumerate(dof_map):
            for j_local, gj in enumerate(dof_map):
                K_full[gi, gj] += k_global[i_local, j_local]

    K = K_full.copy()
    F = F_ext.copy()

    # Apply boundary conditions
    for sup in model.supports:
        if sup.point in point_id_to_idx:
            base = point_id_to_idx[sup.point] * 6
            constraints = [sup.ux, sup.uy, sup.uz, sup.rx, sup.ry, sup.rz]
            for i, constrained in enumerate(constraints):
                if constrained:
                    idx = base + i
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
    displacements: Dict[int, Tuple[float, float, float, float, float, float]] = {}
    reactions: Dict[int, Tuple[float, float, float, float, float, float]] = {}

    for i, point in enumerate(model.points):
        displacements[point.id] = (
            d[i * 6],
            d[i * 6 + 1],
            d[i * 6 + 2],
            d[i * 6 + 3],
            d[i * 6 + 4],
            d[i * 6 + 5],
        )
        reactions[point.id] = (
            reactions_vec[i * 6],
            reactions_vec[i * 6 + 1],
            reactions_vec[i * 6 + 2],
            reactions_vec[i * 6 + 3],
            reactions_vec[i * 6 + 4],
            reactions_vec[i * 6 + 5],
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
    displacements: Dict[int, Tuple[float, float, float, float, float, float]] = {}
    reactions: Dict[int, Tuple[float, float, float, float, float, float]] = {}

    for i, point in enumerate(model.points):
        displacements[point.id] = (
            d[i * 6],
            d[i * 6 + 1],
            d[i * 6 + 2],
            d[i * 6 + 3],
            d[i * 6 + 4],
            d[i * 6 + 5],
        )
        reactions[point.id] = (
            reactions_vec[i * 6],
            reactions_vec[i * 6 + 1],
            reactions_vec[i * 6 + 2],
            reactions_vec[i * 6 + 3],
            reactions_vec[i * 6 + 4],
            reactions_vec[i * 6 + 5],
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


def simulate_dynamics(
    model: Model, step: float, simulation_time: float
) -> list[dict[str, Any]]:
    """Perform a simple dynamic simulation using semi-implicit Euler or analytical free fall."""
    if not model.points:
        return []

    # Check for analytical free fall case: all points, no supports, all gravity loads, no other loads
    if (
        not model.supports and
        len(model.loads) == len(model.points) and
        all(load.is_gravity_load for load in model.loads)
    ):
        # Analytical free fall for all points
        G = 9.81
        # Determine sign from the first load
        sign = -1 if model.loads[0].fy.value < 0 else 1
        # Map point id to initial position
        point_map = {p.id: p for p in model.points}
        time_steps = np.arange(0, simulation_time + step, step)
        time_steps = time_steps[time_steps <= simulation_time + 1e-10]
        frames = []
        for t in time_steps:
            frame_points = []
            for load in model.loads:
                p = point_map[load.point]
                y = p.y.value + sign * 0.5 * G * t ** 2
                v = sign * G * t
                frame_points.append({
                    "id": p.id,
                    "x": p.x.value,
                    "y": y,
                    "z": p.z.value,
                    "vy": v,
                })
            frames.append({
                "time": round(t, 4),
                "points": frame_points,
            })
        return frames

    # Otherwise, use the previous semi-implicit Euler method
    point_id_to_idx = {p.id: i for i, p in enumerate(model.points)}
    n_points = len(model.points)
    dof = n_points * 6

    M_lumped = np.ones(dof)
    G = 9.81
    point_masses: dict[int, float] = {}
    for load in model.loads:
        if load.is_gravity_load:
            mass = abs(load.amount.value) / G if G > 0 else 1.0
            point_masses.setdefault(load.point, 0.0)
            point_masses[load.point] += mass
    for point_id, mass in point_masses.items():
        if point_id in point_id_to_idx:
            idx = point_id_to_idx[point_id]
            M_lumped[idx * 6] = mass if mass > 1e-9 else 1.0
            M_lumped[idx * 6 + 1] = mass if mass > 1e-9 else 1.0
            M_lumped[idx * 6 + 2] = mass if mass > 1e-9 else 1.0
    fixed_dofs = []
    for sup in model.supports:
        if sup.point in point_id_to_idx:
            base_idx = point_id_to_idx[sup.point] * 6
            constraints = [sup.ux, sup.uy, sup.uz, sup.rx, sup.ry, sup.rz]
            for i, constrained in enumerate(constraints):
                if constrained:
                    fixed_dofs.append(base_idx + i)
    d = np.zeros(dof)
    v = np.zeros(dof)
    initial_positions = np.array(
        [[p.x.value, p.y.value, p.z.value] for p in model.points]
    )
    simulation_frames = []
    time_steps = np.arange(0, simulation_time + step, step)
    time_steps = time_steps[time_steps <= simulation_time + 1e-10]
    for t in time_steps:
        current_positions = initial_positions + d.reshape(n_points, 6)[:, :3]
        frame_points = []
        for i, p in enumerate(model.points):
            frame_points.append(
                {
                    "id": p.id,
                    "x": current_positions[i, 0],
                    "y": current_positions[i, 1],
                    "z": current_positions[i, 2],
                }
            )
        simulation_frames.append({"time": round(t, 4), "points": frame_points})
        F_gravity = np.zeros(dof)
        for load in model.loads:
            if load.is_gravity_load and load.point in point_id_to_idx:
                idx = point_id_to_idx[load.point]
                F_gravity[idx * 6 + 1] = -abs(load.amount.value)
        acceleration = F_gravity / M_lumped
        acceleration[fixed_dofs] = 0
        if np.any(np.isnan(acceleration)) or np.any(np.isinf(acceleration)):
            print(f"Numerical instability detected at time {t}. Stopping simulation.")
            break
        v += acceleration * step
        v[fixed_dofs] = 0
        d += v * step
        d[fixed_dofs] = 0
    return simulation_frames
