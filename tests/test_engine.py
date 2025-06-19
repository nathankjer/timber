import sys
import math

sys.path.append("src")
from timber import Joint, Member, Load, Support, Model, solve


def test_engine_runs():
    model = Model(
        joints=[Joint(0.0, 0.0), Joint(1.0, 0.0)],
        members=[Member(start=0, end=1, E=200e9, A=0.01, I=1e-6)],
        loads=[Load(joint=1, fy=-100.0)],
        supports=[Support(joint=0, ux=True, uy=True, rz=True)],
    )
    result = solve(model)
    assert 1 in result.displacements


def test_cantilever_beam_deflection():
    E = 210e9
    I = 8.333e-6
    L = 2.0
    F = -1000.0

    model = Model(
        joints=[Joint(0.0, 0.0), Joint(L, 0.0)],
        members=[Member(start=0, end=1, E=E, A=0.01, I=I)],
        loads=[Load(joint=1, fy=F)],
        supports=[Support(joint=0, ux=True, uy=True, rz=True)],
    )
    res = solve(model)
    dy = res.displacements[1][1]
    expected = F * L**3 / (3 * E * I)
    assert math.isclose(dy, expected, rel_tol=1e-4)


def test_null_load_values():
    model = Model(
        joints=[Joint(0.0, 0.0), Joint(1.0, 0.0)],
        members=[Member(start=0, end=1, E=200e9, A=0.01, I=1e-6)],
        loads=[Load(joint=1, fx=None, fy=None, mz=None)],
        supports=[Support(joint=0, ux=True, uy=True, rz=True)],
    )
    result = solve(model)
    assert isinstance(result.displacements[1][1], float)
