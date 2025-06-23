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
from timber.units import length, stress, area, moment_of_inertia, force, moment

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
        points=[Point(id=1, x=length(0.0), y=length(0.0)), Point(id=2, x=length(1.0), y=length(0.0))],
        members=[Member(start=1, end=2, E=stress(200e9), A=area(0.01), I=moment_of_inertia(1e-6), J=moment_of_inertia(2e-6), G=stress(75e9))],
        loads=[Load(point=2, fy=force(-100.0))],
        supports=[Support(point=1, ux=True, uy=True, uz=True, rx=True, ry=True, rz=True)],
    )
    result = solve(model)
    assert 2 in result.displacements


def test_cantilever_beam_deflection():
    E = stress(210e9)
    I = moment_of_inertia(8.333e-6)
    L = length(2.0)
    F = force(-1000.0)

    model = Model(
        points=[Point(id=1, x=length(0.0), y=length(0.0)), Point(id=2, x=L, y=length(0.0))],
        members=[Member(start=1, end=2, E=E, A=area(0.01), I=I, J=moment_of_inertia(2e-6), G=stress(E.value/(2*1.3)))],
        loads=[Load(point=2, fy=F)],
        supports=[Support(point=1, ux=True, uy=True, uz=True, rx=True, ry=True, rz=True)],
    )
    res = solve(model)
    dy = res.displacements[2][1]
    expected = F.value * L.value**3 / (3 * E.value * I.value)
    assert math.isclose(dy, expected, rel_tol=1e-4)


def test_null_load_values():
    model = Model(
        points=[Point(id=1, x=length(0.0), y=length(0.0)), Point(id=2, x=length(1.0), y=length(0.0))],
        members=[Member(start=1, end=2, E=stress(200e9), A=area(0.01), I=moment_of_inertia(1e-6), J=moment_of_inertia(2e-6), G=stress(75e9))],
        loads=[Load(point=2, fx=force(0.0), fy=force(0.0), mz=moment(0.0))],
        supports=[Support(point=1, ux=True, uy=True, rz=True)],
    )
    result = solve(model)
    assert isinstance(result.displacements[2][1], float)


# --------------------------------------------------------------------------- #
# NEW TESTS
# --------------------------------------------------------------------------- #

# ---- Helper & transformation routines ------------------------------------ #


def test_local_stiffness_symmetry_and_key_value():
    """The 12x12 local stiffness matrix should be symmetric and its (0,0)
    entry must equal A·E/L for pure axial response."""
    E, A, I, G, J, L = 200e9, 0.02, 1e-6, 75e9, 2e-6, 2.5
    k = _local_stiffness(E, A, I, I, G, J, L)
    # Symmetry
    assert np.allclose(k, k.T)
    # Check first diagonal term
    assert math.isclose(k[0, 0], A * E / L, rel_tol=1e-9)


def test_transformation_matrix_is_orthonormal():
    """For a rotation by 45°, the leading 3x3 block should be orthonormal."""
    angle = math.radians(45)
    c, s = math.cos(angle), math.sin(angle)
    T = _transformation(c, s)
    R = T[:3, :3]  # Leading rotation block
    I = np.eye(3)
    assert np.allclose(R @ R.T, I, atol=1e-12)
    assert np.allclose(R.T @ R, I, atol=1e-12)


# ---- Assembly and boundary-condition handling ---------------------------- #


def test_assemble_applies_support_constraints():
    """Rows/cols associated with fully fixed joint should turn into an
    identity sub-matrix after boundary conditions are enforced."""
    model = Model(
        points=[Point(id=1, x=length(0), y=length(0)), Point(id=2, x=length(1), y=length(0))],
        members=[Member(start=1, end=2, E=stress(210e9), A=area(0.01), I=moment_of_inertia(1e-6), J=moment_of_inertia(2e-6), G=stress(75e9))],
        supports=[Support(point=1, ux=True, uy=True, uz=True, rx=True, ry=True, rz=True)],
    )
    _, _, K, _ = _assemble_matrices(model)
    # DOF indices 0-5 correspond to point 1 constraints
    fixed = range(6)
    for i in fixed:
        # off-diagonals must be zero
        assert np.allclose(np.delete(K[i], i), 0.0)
        # diagonals must be one
        assert math.isclose(K[i, i], 1.0, rel_tol=0, abs_tol=0)


# ---- Diagnostics helper -------------------------------------------------- #


def test_diagnostics_detect_unstable_and_missing_supports():
    """Model with no supports is singular and should trigger two distinct
    issue flags."""
    model = Model(points=[Point(id=1, x=length(0), y=length(0))])
    res, issues = solve_with_diagnostics(model)

    # Displacements should exist for the single point
    assert 1 in res.displacements
    # Diagnostic messages
    assert any("unstable" in msg for msg in issues)
    assert any("No supports" in msg for msg in issues)


def test_diagnostics_detect_zero_length_member():
    """Zero-length members should be flagged."""
    model = Model(
        points=[Point(id=1, x=length(0), y=length(0)), Point(id=2, x=length(0), y=length(0))],  # identical coords
        members=[Member(start=1, end=2, E=stress(210e9), A=area(0.01), I=moment_of_inertia(1e-6), J=moment_of_inertia(2e-6), G=stress(75e9))],
        supports=[Support(point=1, ux=True, uy=True, uz=True, rz=True)],
    )
    _, issues = solve_with_diagnostics(model)
    assert any("zero length" in msg for msg in issues)


def test_diagnostics_detect_large_displacements():
    """Extremely flexible cantilever should produce |u|max > 1e6 — this
    triggers the large-displacement warning but *not* the instability one."""
    model = Model(
        points=[Point(id=1, x=length(0), y=length(0)), Point(id=2, x=length(1.0), y=length(0))],
        members=[Member(start=1, end=2, E=stress(1e3), A=area(1e-4), I=moment_of_inertia(1e-8), J=moment_of_inertia(2e-8), G=stress(4e2))],
        loads=[Load(point=2, fy=force(-1e5))],  # big tip load
        supports=[Support(point=1, ux=True, uy=True, uz=True, rx=True, ry=True, rz=True)],
    )
    _, issues = solve_with_diagnostics(model)
    assert any("Very large displacements" in msg for msg in issues)
    # Make sure the instability message **isn't** wrongly triggered here
    assert not any("unstable" in msg for msg in issues)
