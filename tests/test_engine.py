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
    simulate_dynamics,
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


def test_simulate_dynamics_returns_frames():
    """Test that simulate_dynamics returns a list of simulation frames."""
    model = Model(
        points=[
            Point(id=1, x=length(0.0), y=length(0.0)), 
            Point(id=2, x=length(1.0), y=length(0.0))
        ],
        members=[
            Member(
                start=1, 
                end=2, 
                E=stress(200e9), 
                A=area(0.01), 
                I=moment_of_inertia(1e-6), 
                J=moment_of_inertia(2e-6), 
                G=stress(75e9)
            )
        ],
        loads=[
            Load(point=2, fy=force(-100.0), is_gravity_load=True)
        ],
        supports=[
            Support(point=1, ux=True, uy=True, uz=True, rx=True, ry=True, rz=True)
        ],
    )
    
    frames = simulate_dynamics(model, step=0.1, simulation_time=1.0)
    
    # Should return a list of frames
    assert isinstance(frames, list)
    assert len(frames) > 0
    
    # Each frame should have time and points
    for frame in frames:
        assert "time" in frame
        assert "points" in frame
        assert isinstance(frame["time"], (int, float))
        assert isinstance(frame["points"], list)
        
        # Each point should have id, x, y, z
        for point in frame["points"]:
            assert "id" in point
            assert "x" in point
            assert "y" in point
            assert "z" in point
            assert isinstance(point["x"], (int, float))
            assert isinstance(point["y"], (int, float))
            assert isinstance(point["z"], (int, float))


def test_simulate_dynamics_empty_model():
    """Test that simulate_dynamics handles empty models gracefully."""
    model = Model()
    frames = simulate_dynamics(model, step=0.1, simulation_time=1.0)
    assert frames == []


def test_simulate_dynamics_multiple_frames():
    """Test that simulate_dynamics generates the correct number of frames."""
    model = Model(
        points=[Point(id=1, x=length(0.0), y=length(0.0))],
        loads=[Load(point=1, fy=force(-9.81), is_gravity_load=True)],
        supports=[],
    )
    
    # Test with 1-second steps for 5 seconds
    frames = simulate_dynamics(model, step=1.0, simulation_time=5.0)
    
    # Should have 6 frames (0, 1, 2, 3, 4, 5 seconds)
    assert len(frames) == 6
    
    # Check that time values are correct
    for i, frame in enumerate(frames):
        assert frame["time"] == i
        assert len(frame["points"]) == 1
        point = frame["points"][0]
        assert point["id"] == 1
        assert "x" in point
        assert "y" in point
        assert "z" in point
        assert "vy" in point  # Should have analytical velocity


def test_simulate_dynamics_free_fall_physics():
    """Test that the simulation correctly implements free fall physics.
    
    For an object in free fall (no air resistance), the equations are:
    - a(t) = g (constant acceleration)
    - v(t) = g * t (velocity at time t)
    - d(t) = 0.5 * g * t^2 (displacement at time t)
    
    This test validates against the textbook table provided.
    """
    # Create a simple model: one point with mass, no supports (free fall)
    model = Model(
        points=[Point(id=1, x=length(0.0), y=length(0.0))],
        loads=[Load(point=1, fy=force(-9.81), is_gravity_load=True)],  # 1kg mass * 9.81 m/s²
        supports=[],  # No supports = free fall
    )
    
    # Run simulation for 10 seconds with 1-second steps
    frames = simulate_dynamics(model, step=1.0, simulation_time=10.0)
    
    # Should have 11 frames (0, 1, 2, ..., 10 seconds)
    assert len(frames) == 11
    
    # Validate against textbook table
    expected_displacements = [0, 0.5, 2, 4.5, 8, 12.5, 18, 24.5, 32, 40.5, 50]
    expected_velocities = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    
    for i, frame in enumerate(frames):
        t = frame["time"]
        assert t == i  # Time should match frame index
        
        # Get the point data
        point = frame["points"][0]  # Only one point in our model
        y_displacement = point["y"]  # Y displacement (should be negative for downward motion)
        
        # Convert to positive values for comparison with textbook
        y_displacement_positive = abs(y_displacement)
        
        # Check displacement (allow some numerical tolerance)
        expected_d = expected_displacements[i] * 9.81  # Convert g units to m/s²
        assert abs(y_displacement_positive - expected_d) < 0.1, f"At t={t}s: expected {expected_d}, got {y_displacement_positive}"
        
        # Check velocity (analytical if present, else finite difference)
        expected_v = expected_velocities[i] * 9.81
        if "vy" in point:
            velocity = abs(point["vy"])
            assert abs(velocity - expected_v) < 0.1, f"At t={t}s: expected v={expected_v}, got v={velocity}"
        elif i > 0:
            prev_frame = frames[i-1]
            prev_y = prev_frame["points"][0]["y"]
            dt = frame["time"] - prev_frame["time"]
            if dt > 0:
                velocity = abs((point["y"] - prev_y) / dt)
                assert abs(velocity - expected_v) < 0.5, f"At t={t}s: expected v={expected_v}, got v={velocity}"


def test_simulate_dynamics_equilateral_triangle_free_fall():
    """Test that an equilateral triangle structure falls as a connected unit.
    
    This test verifies that connected objects (three members forming a triangle)
    fall together as one cohesive unit, maintaining their relative positions.
    
    Uses the same textbook table as the single point test.
    """
    # Create an equilateral triangle with side length 2 units
    # Points at (0,0), (2,0), and (1,√3)
    side_length = 2.0
    height = side_length * math.sqrt(3) / 2
    
    model = Model(
        points=[
            Point(id=1, x=length(0.0), y=length(0.0)),           # Bottom left
            Point(id=2, x=length(side_length), y=length(0.0)),    # Bottom right  
            Point(id=3, x=length(side_length/2), y=length(height)), # Top
        ],
        members=[
            Member(start=1, end=2, E=stress(200e9), A=area(0.01), I=moment_of_inertia(1e-6), J=moment_of_inertia(2e-6), G=stress(75e9)),  # Bottom
            Member(start=1, end=3, E=stress(200e9), A=area(0.01), I=moment_of_inertia(1e-6), J=moment_of_inertia(2e-6), G=stress(75e9)),  # Left
            Member(start=2, end=3, E=stress(200e9), A=area(0.01), I=moment_of_inertia(1e-6), J=moment_of_inertia(2e-6), G=stress(75e9)),  # Right
        ],
        loads=[
            Load(point=1, fy=force(-9.81), is_gravity_load=True),  # 1kg mass at each point
            Load(point=2, fy=force(-9.81), is_gravity_load=True),
            Load(point=3, fy=force(-9.81), is_gravity_load=True),
        ],
        supports=[],  # No supports = free fall
    )
    
    # Run simulation for 10 seconds with 1-second steps
    frames = simulate_dynamics(model, step=1.0, simulation_time=10.0)
    
    # Should have 11 frames (0, 1, 2, ..., 10 seconds)
    assert len(frames) == 11
    
    # Validate against textbook table - all points should fall together
    expected_displacements = [0, 0.5, 2, 4.5, 8, 12.5, 18, 24.5, 32, 40.5, 50]
    expected_velocities = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    
    for i, frame in enumerate(frames):
        t = frame["time"]
        assert t == i  # Time should match frame index
        
        # Get all three points
        points = frame["points"]
        assert len(points) == 3
        
        # All points should have the same Y displacement from their initial positions (falling together)
        # Initial positions: point 1 at y=0, point 2 at y=0, point 3 at y=height
        initial_y_positions = [0.0, 0.0, height]
        y_displacements = [abs(p["y"] - initial_y_positions[j]) for j, p in enumerate(points)]
        
        # Check that all points fall at the same rate
        expected_d = expected_displacements[i] * 9.81  # Convert g units to m/s²
        
        for j, y_disp in enumerate(y_displacements):
            assert abs(y_disp - expected_d) < 0.1, f"At t={t}s, point {j+1}: expected {expected_d}, got {y_disp}"
        
        # Check that the triangle maintains its shape (relative positions)
        # Calculate the side lengths at this frame
        p1 = points[0]
        p2 = points[1] 
        p3 = points[2]
        
        # Calculate current side lengths
        side1_length = math.sqrt((p2["x"] - p1["x"])**2 + (p2["y"] - p1["y"])**2)
        side2_length = math.sqrt((p3["x"] - p1["x"])**2 + (p3["y"] - p1["y"])**2)
        side3_length = math.sqrt((p3["x"] - p2["x"])**2 + (p3["y"] - p2["y"])**2)
        
        # All sides should remain approximately equal (within 1% tolerance)
        assert abs(side1_length - side2_length) < side_length * 0.01, f"At t={t}s: sides 1 and 2 differ by {abs(side1_length - side2_length)}"
        assert abs(side1_length - side3_length) < side_length * 0.01, f"At t={t}s: sides 1 and 3 differ by {abs(side1_length - side3_length)}"
        assert abs(side2_length - side3_length) < side_length * 0.01, f"At t={t}s: sides 2 and 3 differ by {abs(side2_length - side3_length)}"
        
        # Check velocity (analytical if present, else finite difference)
        expected_v = expected_velocities[i] * 9.81
        for j, point in enumerate(points):
            if "vy" in point:
                velocity = abs(point["vy"])
                assert abs(velocity - expected_v) < 0.1, f"At t={t}s, point {j+1}: expected v={expected_v}, got v={velocity}"
            elif i > 0:
                prev_frame = frames[i-1]
                prev_y = prev_frame["points"][j]["y"]
                dt = frame["time"] - prev_frame["time"]
                if dt > 0:
                    velocity = abs((point["y"] - prev_y) / dt)
                    assert abs(velocity - expected_v) < 0.5, f"At t={t}s, point {j+1}: expected v={expected_v}, got v={velocity}"
