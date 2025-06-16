from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Tuple
import numpy as np


@dataclass
class Joint:
    """A zero-dimensional connection point."""

    x: float
    y: float


@dataclass
class Member:
    """A prismatic beam element between two joints."""

    start: int
    end: int
    E: float
    A: float
    I: float


@dataclass
class Load:
    """Nodal load."""

    joint: int
    fx: float = 0.0
    fy: float = 0.0
    mz: float = 0.0


@dataclass
class Support:
    """Boundary condition flags (True means constrained)."""

    joint: int
    ux: bool = False
    uy: bool = False
    rz: bool = False


@dataclass
class Model:
    joints: List[Joint] = field(default_factory=list)
    members: List[Member] = field(default_factory=list)
    loads: List[Load] = field(default_factory=list)
    supports: List[Support] = field(default_factory=list)


@dataclass
class Results:
    displacements: Dict[int, Tuple[float, float, float]]
    reactions: Dict[int, Tuple[float, float, float]]


def _local_stiffness(E: float, A: float, I: float, L: float) -> np.ndarray:
    """Return the 6x6 local stiffness matrix for a 2D frame element."""
    k = np.array(
        [
            [A * E / L, 0, 0, -A * E / L, 0, 0],
            [0, 12 * E * I / L ** 3, 6 * E * I / L ** 2, 0, -12 * E * I / L ** 3, 6 * E * I / L ** 2],
            [0, 6 * E * I / L ** 2, 4 * E * I / L, 0, -6 * E * I / L ** 2, 2 * E * I / L],
            [-A * E / L, 0, 0, A * E / L, 0, 0],
            [0, -12 * E * I / L ** 3, -6 * E * I / L ** 2, 0, 12 * E * I / L ** 3, -6 * E * I / L ** 2],
            [0, 6 * E * I / L ** 2, 2 * E * I / L, 0, -6 * E * I / L ** 2, 4 * E * I / L],
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


def solve(model: Model) -> Results:
    """Solve for nodal displacements and reactions."""
    n_joints = len(model.joints)
    dof = n_joints * 3
    K_full = np.zeros((dof, dof))
    F_ext = np.zeros(dof)

    # Assemble global load vector
    for load in model.loads:
        idx = load.joint * 3
        F_ext[idx] += load.fx
        F_ext[idx + 1] += load.fy
        F_ext[idx + 2] += load.mz

    # Assemble global stiffness matrix
    for m in model.members:
        j1 = model.joints[m.start]
        j2 = model.joints[m.end]
        dx = j2.x - j1.x
        dy = j2.y - j1.y
        L = (dx ** 2 + dy ** 2) ** 0.5
        if L == 0:
            continue
        c = dx / L
        s = dy / L
        k_local = _local_stiffness(m.E, m.A, m.I, L)
        T = _transformation(c, s)
        k_global = T.T @ k_local @ T
        dof_map = [m.start * 3, m.start * 3 + 1, m.start * 3 + 2, m.end * 3, m.end * 3 + 1, m.end * 3 + 2]
        for i_local, gi in enumerate(dof_map):
            for j_local, gj in enumerate(dof_map):
                K_full[gi, gj] += k_global[i_local, j_local]

    K = K_full.copy()
    F = F_ext.copy()

    # Apply supports (boundary conditions)
    for sup in model.supports:
        base = sup.joint * 3
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

    # Solve
    try:
        d = np.linalg.solve(K, F)
    except np.linalg.LinAlgError:
        d = np.linalg.lstsq(K, F, rcond=None)[0]

    # Reactions
    reactions_vec = K_full @ d - F_ext
    displacements: Dict[int, Tuple[float, float, float]] = {}
    reactions: Dict[int, Tuple[float, float, float]] = {}
    for i in range(n_joints):
        displacements[i] = (d[i * 3], d[i * 3 + 1], d[i * 3 + 2])
        reactions[i] = (reactions_vec[i * 3], reactions_vec[i * 3 + 1], reactions_vec[i * 3 + 2])

    return Results(displacements=displacements, reactions=reactions)
