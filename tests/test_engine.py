"""
Additional tests for timber.engine to reach full line coverage without
removing the author-supplied baseline tests.

pytest -q --cov=src/timber/engine.py
"""

import math
import sys

import numpy as np

# Make sure "src" is importable, just like the baseline file does
sys.path.append("src")

# --- public API imports ---------------------------------------------------- #
from timber import Load, Member, Model, Point, Support, solve

# --- internal helpers ------------------------------------------------------ #
from timber.engine import (
    _assemble_matrices,
    _local_stiffness,
    _transformation,
    solve_with_diagnostics,
)

# --------------------------------------------------------------------------- #
# ORIGINAL TESTS (unaltered)
# --------------------------------------------------------------------------- #


def test_engine_runs():
    model = Model(
        points=[Point(id=1, x=0.0, y=0.0), Point(id=2, x=1.0, y=0.0)],
        members=[Member(start=1, end=2, E=200e9, A=0.01, I=1e-6)],
        loads=[Load(point=2, fy=-100.0)],
        supports=[Support(point=1, ux=True, uy=True, rz=True)],
    )
    result = solve(model)
    assert 2 in result.displacements


def test_cantilever_beam_deflection():
    E = 210e9
    I = 8.333e-6
    L = 2.0
    F = -1000.0

    model = Model(
        points=[Point(id=1, x=0.0, y=0.0), Point(id=2, x=L, y=0.0)],
        members=[Member(start=1, end=2, E=E, A=0.01, I=I)],
        loads=[Load(point=2, fy=F)],
        supports=[Support(point=1, ux=True, uy=True, rz=True)],
    )
    res = solve(model)
    dy = res.displacements[2][1]
    expected = F * L**3 / (3 * E * I)
    assert math.isclose(dy, expected, rel_tol=1e-4)


def test_null_load_values():
    model = Model(
        points=[Point(id=1, x=0.0, y=0.0), Point(id=2, x=1.0, y=0.0)],
        members=[Member(start=1, end=2, E=200e9, A=0.01, I=1e-6)],
        loads=[Load(point=2, fx=0.0, fy=0.0, mz=0.0)],
        supports=[Support(point=1, ux=True, uy=True, rz=True)],
    )
    result = solve(model)
    assert isinstance(result.displacements[2][1], float)


# --------------------------------------------------------------------------- #
# NEW TESTS
# --------------------------------------------------------------------------- #

# ---- Helper & transformation routines ------------------------------------ #


def test_local_stiffness_symmetry_and_key_value():
    """The 6×6 local stiffness matrix should be symmetric and its (0,0)
    entry must equal A·E/L for pure axial response."""
    E, A, I, L = 200e9, 0.02, 1e-6, 2.5
    k = _local_stiffness(E, A, I, L)
    # Symmetry
    assert np.allclose(k, k.T)
    # Check first diagonal term
    assert math.isclose(k[0, 0], A * E / L, rel_tol=1e-9)


def test_transformation_matrix_is_orthonormal():
    """For a rotation by 45°, the leading 2×2 block should be orthonormal."""
    angle = math.radians(45)
    c, s = math.cos(angle), math.sin(angle)
    T = _transformation(c, s)
    R = T[:2, :2]  # Leading rotation block
    I = np.eye(2)
    assert np.allclose(R @ R.T, I, atol=1e-12)
    assert np.allclose(R.T @ R, I, atol=1e-12)


# ---- Assembly and boundary-condition handling ---------------------------- #


def test_assemble_applies_support_constraints():
    """Rows/cols associated with fully fixed joint should turn into an
    identity sub-matrix after boundary conditions are enforced."""
    model = Model(
        points=[Point(id=1, x=0, y=0), Point(id=2, x=1, y=0)],
        members=[Member(start=1, end=2, E=210e9, A=0.01, I=1e-6)],
        supports=[Support(point=1, ux=True, uy=True, rz=True)],
    )
    _, _, K, _ = _assemble_matrices(model)
    # DOF indices 0,1,2 correspond to point 1 constraints
    fixed = (0, 1, 2)
    for i in fixed:
        # off-diagonals must be zero
        assert np.allclose(np.delete(K[i], i), 0.0)
        # diagonals must be one
        assert math.isclose(K[i, i], 1.0, rel_tol=0, abs_tol=0)


# ---- Diagnostics helper -------------------------------------------------- #


def test_diagnostics_detect_unstable_and_missing_supports():
    """Model with no supports is singular and should trigger two distinct
    issue flags."""
    model = Model(points=[Point(id=1, x=0, y=0)])
    res, issues = solve_with_diagnostics(model)

    # Displacements should exist for the single point
    assert 1 in res.displacements
    # Diagnostic messages
    assert any("unstable" in msg for msg in issues)
    assert any("No supports" in msg for msg in issues)


def test_diagnostics_detect_zero_length_member():
    """Zero-length members should be flagged."""
    model = Model(
        points=[Point(id=1, x=0, y=0), Point(id=2, x=0, y=0)],  # identical coords
        members=[Member(start=1, end=2, E=210e9, A=0.01, I=1e-6)],
        supports=[Support(point=1, ux=True, uy=True, rz=True)],
    )
    _, issues = solve_with_diagnostics(model)
    assert any("zero length" in msg for msg in issues)


def test_diagnostics_detect_large_displacements():
    """Extremely flexible cantilever should produce |u|max > 1e6 — this
    triggers the large-displacement warning but *not* the instability one."""
    model = Model(
        points=[Point(id=1, x=0, y=0), Point(id=2, x=1.0, y=0)],
        members=[Member(start=1, end=2, E=1e3, A=1e-4, I=1e-8)],
        loads=[Load(point=2, fy=-1e5)],  # big tip load
        supports=[Support(point=1, ux=True, uy=True, rz=True)],
    )
    _, issues = solve_with_diagnostics(model)
    assert any("Very large displacements" in msg for msg in issues)
    # Make sure the instability message **isn't** wrongly triggered here
    assert not any("unstable" in msg for msg in issues)
