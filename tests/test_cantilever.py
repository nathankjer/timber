import sys
import math
sys.path.append('src')
from timber import Joint, Member, Load, Support, Model, solve


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
    expected = F * L ** 3 / (3 * E * I)
    assert math.isclose(dy, expected, rel_tol=1e-4)
