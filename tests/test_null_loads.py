import sys
sys.path.append('src')
from timber import Joint, Member, Load, Support, Model, solve


def test_null_load_values():
    model = Model(
        joints=[Joint(0.0, 0.0), Joint(1.0, 0.0)],
        members=[Member(start=0, end=1, E=200e9, A=0.01, I=1e-6)],
        loads=[Load(joint=1, fx=None, fy=None, mz=None)],
        supports=[Support(joint=0, ux=True, uy=True, rz=True)],
    )
    result = solve(model)
    assert isinstance(result.displacements[1][1], float)
