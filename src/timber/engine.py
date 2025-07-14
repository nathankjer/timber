from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from .units import UnitQuantity, acceleration, area, force, get_unit_manager, length, mass, moment, moment_of_inertia, stress, velocity

# =============================================================================
# PHYSICAL CONSTANTS AND CONFIGURATION
# =============================================================================


# Numerical tolerances and limits
class NumericalConfig:
    """Configuration for numerical stability and precision."""

    # Matrix condition number tolerance for pseudo-inverse
    PSEUDO_INVERSE_TOLERANCE = 1e-12

    # Maximum values to prevent numerical overflow
    MAX_ACCELERATION = 1e6  # m/s²
    MAX_VELOCITY = 1e4  # m/s
    MAX_DISPLACEMENT = 1e3  # m

    # Stress threshold for failure checking (avoid checking zero stresses)
    STRESS_CHECK_THRESHOLD = 1e-12  # Pa

    # Shear factor for rectangular sections (from beam theory)
    RECTANGULAR_SHEAR_FACTOR = 1.5


# Physical constants
class PhysicalConstants:
    """Physical constants used in the simulation."""

    # Standard gravitational acceleration
    GRAVITATIONAL_ACCELERATION = 9.81  # m/s²

    # Rayleigh damping coefficients (default values)
    # These should be computed based on target modal damping ratios
    DEFAULT_ALPHA = 0.02  # Mass proportional damping coefficient
    DEFAULT_BETA = 0.02  # Stiffness proportional damping coefficient


# Material properties (default values - should be overridden per member)
class DefaultMaterials:
    """Default material properties for structural analysis."""

    # Steel (typical structural steel)
    STEEL = {
        "E": 200e9,  # Pa - Young's modulus
        "G": 75e9,  # Pa - Shear modulus
        "density": 7850.0,  # kg/m³
        "tensile_strength": 400e6,  # Pa
        "compressive_strength": 400e6,  # Pa
        "shear_strength": 240e6,  # Pa
        "bending_strength": 400e6,  # Pa (same as tensile for steel)
    }

    # Wood (Douglas fir, structural grade)
    WOOD = {
        "E": 12e9,  # Pa - Young's modulus
        "G": 4.5e9,  # Pa - Shear modulus
        "density": 500.0,  # kg/m³
        "tensile_strength": 40e6,  # Pa
        "compressive_strength": 30e6,  # Pa
        "shear_strength": 5e6,  # Pa
        "bending_strength": 60e6,  # Pa (modulus of rupture, typically 1.5x tensile)
    }


# =============================================================================
# SECTION GEOMETRY CLASSES
# =============================================================================


@dataclass
class Section:
    """Cross-sectional properties for structural analysis."""

    A: UnitQuantity  # Cross-sectional area
    Iy: UnitQuantity  # Moment of inertia about y-axis
    Iz: UnitQuantity  # Moment of inertia about z-axis
    J: UnitQuantity  # Torsional constant
    y_max: UnitQuantity  # Distance to extreme fiber in y-direction
    z_max: UnitQuantity  # Distance to extreme fiber in z-direction

    def __post_init__(self):
        """Convert inputs to proper unit quantities."""
        self.A = _to_unit_quantity(self.A, "area")
        self.Iy = _to_unit_quantity(self.Iy, "moment_of_inertia")
        self.Iz = _to_unit_quantity(self.Iz, "moment_of_inertia")
        self.J = _to_unit_quantity(self.J, "moment_of_inertia")
        self.y_max = _to_unit_quantity(self.y_max, "length")
        self.z_max = _to_unit_quantity(self.z_max, "length")

    @classmethod
    def rectangular(cls, width: float, height: float) -> "Section":
        """Create a rectangular section with given width and height."""
        A = width * height
        Iy = width * height**3 / 12
        Iz = height * width**3 / 12
        J = min(Iy, Iz) * 0.3  # Approximate torsional constant
        y_max = height / 2
        z_max = width / 2

        return cls(A=area(A), Iy=moment_of_inertia(Iy), Iz=moment_of_inertia(Iz), J=moment_of_inertia(J), y_max=length(y_max), z_max=length(z_max))

    @classmethod
    def circular(cls, diameter: float) -> "Section":
        """Create a circular section with given diameter."""
        radius = diameter / 2
        A = np.pi * radius**2
        I = np.pi * radius**4 / 4
        J = 2 * I  # For circular sections, J = 2I
        y_max = z_max = radius

        return cls(A=area(A), Iy=moment_of_inertia(I), Iz=moment_of_inertia(I), J=moment_of_inertia(J), y_max=length(y_max), z_max=length(z_max))


@dataclass
class Material:
    """Material properties for structural analysis."""

    E: UnitQuantity  # Young's modulus
    G: UnitQuantity  # Shear modulus
    density: UnitQuantity  # Material density
    tensile_strength: UnitQuantity  # Tensile strength
    compressive_strength: UnitQuantity  # Compressive strength
    shear_strength: UnitQuantity  # Shear strength
    bending_strength: UnitQuantity  # Bending strength (modulus of rupture)

    def __post_init__(self):
        """Convert inputs to proper unit quantities."""
        self.E = _to_unit_quantity(self.E, "stress")
        self.G = _to_unit_quantity(self.G, "stress")
        self.density = _to_unit_quantity(self.density, "mass")
        self.tensile_strength = _to_unit_quantity(self.tensile_strength, "stress")
        self.compressive_strength = _to_unit_quantity(self.compressive_strength, "stress")
        self.shear_strength = _to_unit_quantity(self.shear_strength, "stress")
        self.bending_strength = _to_unit_quantity(self.bending_strength, "stress")

    @classmethod
    def steel(cls) -> "Material":
        """Create steel material with typical properties."""
        props = DefaultMaterials.STEEL
        return cls(E=stress(props["E"]), G=stress(props["G"]), density=mass(props["density"]), tensile_strength=stress(props["tensile_strength"]), compressive_strength=stress(props["compressive_strength"]), shear_strength=stress(props["shear_strength"]), bending_strength=stress(props["bending_strength"]))

    @classmethod
    def wood(cls) -> "Material":
        """Create wood material with typical properties."""
        props = DefaultMaterials.WOOD
        return cls(E=stress(props["E"]), G=stress(props["G"]), density=mass(props["density"]), tensile_strength=stress(props["tensile_strength"]), compressive_strength=stress(props["compressive_strength"]), shear_strength=stress(props["shear_strength"]), bending_strength=stress(props["bending_strength"]))


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================


def _to_unit_quantity(val: Any, kind: str) -> UnitQuantity:
    """Convert val to a UnitQuantity of the given kind (length, force, etc)."""
    if isinstance(val, UnitQuantity):
        # Defensive: ensure .value is a float, not a dict
        if isinstance(val.value, dict):
            return UnitQuantity(_to_unit_quantity(val.value, kind).value, val.unit_vector)
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
    if kind == "mass":
        return mass(val)
    if kind == "velocity":
        return velocity(val)
    return val


def _compute_rayleigh_damping_coefficients(target_damping_ratio: float, frequency1: float = 1.0, frequency2: float = 10.0) -> Tuple[float, float]:
    """
    Compute Rayleigh damping coefficients α and β for target damping ratio.

    Args:
        target_damping_ratio: Target modal damping ratio (e.g., 0.02 for 2%)
        frequency1: First frequency for damping calculation (Hz)
        frequency2: Second frequency for damping calculation (Hz)

    Returns:
        Tuple of (alpha, beta) coefficients
    """
    omega1 = 2 * np.pi * frequency1
    omega2 = 2 * np.pi * frequency2

    # Solve the system: ζ = α/(2ω) + βω/2
    # For two frequencies, we have:
    # ζ1 = α/(2ω1) + βω1/2
    # ζ2 = α/(2ω2) + βω2/2

    A = np.array([[1 / (2 * omega1), omega1 / 2], [1 / (2 * omega2), omega2 / 2]])
    b = np.array([target_damping_ratio, target_damping_ratio])

    try:
        alpha, beta = np.linalg.solve(A, b)
        return alpha, beta
    except np.linalg.LinAlgError:
        # Fallback to default values if matrix is singular
        return PhysicalConstants.DEFAULT_ALPHA, PhysicalConstants.DEFAULT_BETA


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class Point:
    """A 3D point with unique ID."""

    id: int
    x: UnitQuantity
    y: UnitQuantity
    z: UnitQuantity = field(default_factory=lambda: length(0.0))
    mass: UnitQuantity = field(default_factory=lambda: mass(0.0))  # Add mass property

    def __post_init__(self):
        self.x = _to_unit_quantity(self.x, "length")
        self.y = _to_unit_quantity(self.y, "length")
        self.z = _to_unit_quantity(self.z, "length")
        self.mass = _to_unit_quantity(self.mass, "mass")


@dataclass
class Member:
    """A prismatic beam element between two points."""

    start: int  # Point ID
    end: int  # Point ID
    material: Material = field(default_factory=Material.wood)
    section: Section = field(default_factory=lambda: Section.rectangular(0.1, 0.1))
    # Failure tracking
    is_broken: bool = False
    break_time: Optional[float] = None
    failure_mode: Optional[str] = None

    def __post_init__(self):
        """Validate and set up the member."""
        if not isinstance(self.material, Material):
            raise ValueError("material must be a Material instance")
        if not isinstance(self.section, Section):
            raise ValueError("section must be a Section instance")

    @property
    def E(self) -> UnitQuantity:
        """Young's modulus."""
        return self.material.E

    @property
    def G(self) -> UnitQuantity:
        """Shear modulus."""
        return self.material.G

    @property
    def A(self) -> UnitQuantity:
        """Cross-sectional area."""
        return self.section.A

    @property
    def I(self) -> UnitQuantity:
        """Moment of inertia (use Iz as default)."""
        return self.section.Iz

    @property
    def Iy(self) -> UnitQuantity:
        """Moment of inertia about y-axis."""
        return self.section.Iy

    @property
    def Iz(self) -> UnitQuantity:
        """Moment of inertia about z-axis."""
        return self.section.Iz

    @property
    def J(self) -> UnitQuantity:
        """Torsional constant."""
        return self.section.J

    @property
    def density(self) -> UnitQuantity:
        """Material density."""
        return self.material.density

    @property
    def tensile_strength(self) -> UnitQuantity:
        """Tensile strength."""
        return self.material.tensile_strength

    @property
    def compressive_strength(self) -> UnitQuantity:
        """Compressive strength."""
        return self.material.compressive_strength

    @property
    def shear_strength(self) -> UnitQuantity:
        """Shear strength."""
        return self.material.shear_strength

    @property
    def bending_strength(self) -> UnitQuantity:
        """Bending strength (modulus of rupture)."""
        return self.material.bending_strength

    @property
    def y_max(self) -> UnitQuantity:
        """Distance to extreme fiber in y-direction."""
        return self.section.y_max

    @property
    def z_max(self) -> UnitQuantity:
        """Distance to extreme fiber in z-direction."""
        return self.section.z_max


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
    # Time-varying load properties
    time_function: Optional[str] = None  # "constant", "ramp", "impulse", "sinusoidal"
    start_time: float = 0.0
    duration: float = 0.0  # For ramp/impulse loads
    frequency: float = 1.0  # For sinusoidal loads

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
class Frame:
    """Results for a single time step in dynamic simulation."""

    time: float
    positions: Dict[int, Tuple[float, float, float]]  # point_id -> (x, y, z) absolute positions
    velocities: Dict[int, Tuple[float, float, float, float, float, float]]
    accelerations: Dict[int, Tuple[float, float, float, float, float, float]]
    reactions: Dict[int, Tuple[float, float, float, float, float, float]]
    member_forces: Dict[int, Dict[str, float]]  # member_id -> {axial, shear, moment}
    member_stresses: Dict[int, Dict[str, float]]  # member_id -> {tensile, compressive, shear}
    broken_members: List[int] = field(default_factory=list)
    issues: List[str] = field(default_factory=list)


@dataclass
class Results:
    """Complete dynamic simulation results."""

    frames: List[Frame]
    unit_system: str = "metric"
    final_time: float = 0.0
    total_frames: int = 0

    def get_frame_at_time(self, time: float) -> Optional[Frame]:
        """Get the frame closest to the specified time."""
        if not self.frames:
            return None

        # Find the closest frame
        closest_frame = min(self.frames, key=lambda f: abs(f.time - time))
        return closest_frame

    def get_final_frame(self) -> Optional[Frame]:
        """Get the final frame of the simulation."""
        return self.frames[-1] if self.frames else None


def _local_stiffness(E: float, A: float, Iz: float, Iy: float, G: float, J: float, L: float) -> np.ndarray:
    """Return the 12x12 local stiffness matrix for a 3D frame element."""
    k = np.zeros((12, 12))

    # Check for invalid member length and raise descriptive exceptions
    if L <= 0:
        raise ValueError(f"Invalid member length: {L}. Member length must be positive.")
    if np.isnan(L):
        raise ValueError("Member length is NaN. Check member geometry.")
    if np.isinf(L):
        raise ValueError("Member length is infinite. Check member geometry.")
    if L > 1e6:  # Reasonable upper limit for structural analysis
        # Instead of raising an error, return a zero matrix for extreme lengths
        return k

    # Axial stiffness terms
    k[0, 0] = k[6, 6] = A * E / L
    k[0, 6] = k[6, 0] = -A * E / L

    # Bending stiffness in y-z plane (about z-axis)
    L2 = L * L
    L3 = L2 * L

    k[1, 1] = k[7, 7] = 12 * E * Iz / L3
    k[1, 7] = k[7, 1] = -12 * E * Iz / L3
    k[1, 5] = k[5, 1] = 6 * E * Iz / L2
    k[1, 11] = k[11, 1] = 6 * E * Iz / L2
    k[7, 5] = k[5, 7] = -6 * E * Iz / L2
    k[7, 11] = k[11, 7] = -6 * E * Iz / L2
    k[5, 5] = k[11, 11] = 4 * E * Iz / L
    k[5, 11] = k[11, 5] = 2 * E * Iz / L

    # Bending stiffness in x-z plane (about y-axis)
    k[2, 2] = k[8, 8] = 12 * E * Iy / L3
    k[2, 8] = k[8, 2] = -12 * E * Iy / L3
    k[2, 4] = k[4, 2] = -6 * E * Iy / L2
    k[2, 10] = k[10, 2] = -6 * E * Iy / L2
    k[8, 4] = k[4, 8] = 6 * E * Iy / L2
    k[8, 10] = k[10, 8] = 6 * E * Iy / L2
    k[4, 4] = k[10, 10] = 4 * E * Iy / L
    k[4, 10] = k[10, 4] = 2 * E * Iy / L

    # Torsional stiffness
    k[3, 3] = k[9, 9] = G * J / L
    k[3, 9] = k[9, 3] = -G * J / L

    return k


def _local_mass_matrix(A: float, L: float, density: float) -> np.ndarray:
    """Return the 12x12 consistent mass matrix for a 3D frame element."""
    m = np.zeros((12, 12))
    mass = A * L * density

    # Lumped mass matrix (simpler and often more stable for dynamics)
    # Distribute mass equally to the two end nodes
    node_mass = mass / 2.0

    # Translational DOFs (x, y, z) for each node
    m[0, 0] = m[6, 6] = node_mass  # x translation
    m[1, 1] = m[7, 7] = node_mass  # y translation
    m[2, 2] = m[8, 8] = node_mass  # z translation

    # Rotational inertia: for a uniform beam, I_rot = m * L² / 12
    # This is the polar moment of inertia about the beam's longitudinal axis
    rot_inertia = node_mass * L * L / 12.0

    # Ensure minimum rotational inertia to prevent singularities
    min_rot_inertia = 1e-6  # kg⋅m²
    rot_inertia = max(rot_inertia, min_rot_inertia)

    m[3, 3] = m[9, 9] = rot_inertia  # rx rotation
    m[4, 4] = m[10, 10] = rot_inertia  # ry rotation
    m[5, 5] = m[11, 11] = rot_inertia  # rz rotation

    return m


def _transformation_3d(start_pos, end_pos):
    """Return the 12x12 transformation matrix for a 3D frame element."""
    # Vector from start to end
    dx = end_pos[0] - start_pos[0]
    dy = end_pos[1] - start_pos[1]
    dz = end_pos[2] - start_pos[2]
    L = (dx**2 + dy**2 + dz**2) ** 0.5
    if L == 0:
        raise ValueError("Zero-length member in transformation_3d")

    # Local x axis (member axis) - normalized
    x_axis = np.array([dx, dy, dz]) / L

    # Use Gram-Schmidt process to find orthogonal axes
    # Start with a reference vector that's not parallel to x_axis
    # Use the vector with the smallest component of x_axis as reference
    abs_components = np.abs(x_axis)
    min_idx = np.argmin(abs_components)

    # Create reference vector with 1 at min_idx, 0 elsewhere
    v_ref = np.zeros(3)
    v_ref[min_idx] = 1.0

    # Local z axis (perpendicular to x_axis and v_ref)
    z_axis = np.cross(x_axis, v_ref)
    z_norm = np.linalg.norm(z_axis)

    # If x_axis and v_ref are parallel, use a different reference
    if z_norm < NumericalConfig.PSEUDO_INVERSE_TOLERANCE:
        # Use a different reference vector
        v_ref = np.array([1.0, 0.0, 0.0]) if min_idx != 0 else np.array([0.0, 1.0, 0.0])
        z_axis = np.cross(x_axis, v_ref)
        z_norm = np.linalg.norm(z_axis)

        # If still parallel, use the third axis
        if z_norm < NumericalConfig.PSEUDO_INVERSE_TOLERANCE:
            v_ref = np.array([0.0, 0.0, 1.0])
            z_axis = np.cross(x_axis, v_ref)
            z_norm = np.linalg.norm(z_axis)

            # If still parallel, this is a pathological case
            if z_norm < NumericalConfig.PSEUDO_INVERSE_TOLERANCE:
                raise ValueError("Cannot find orthogonal axes for member transformation")

    # Normalize z_axis
    z_axis /= z_norm

    # Local y axis (perpendicular to x_axis and z_axis) - right-handed system
    y_axis = np.cross(z_axis, x_axis)
    y_axis /= np.linalg.norm(y_axis)

    # Build rotation matrix R = [x_axis, y_axis, z_axis]
    # This transforms from local to global coordinates
    R = np.column_stack([x_axis, y_axis, z_axis])

    # Build 12x12 transformation matrix for 2 nodes × 6 DOFs each
    T = np.zeros((12, 12))

    # For each node (2 nodes), apply the rotation matrix to the 3 translational DOFs
    for i in range(2):  # 2 nodes
        # Translational DOFs (x, y, z) for each node
        start_idx = i * 6
        T[start_idx : start_idx + 3, start_idx : start_idx + 3] = R

        # Rotational DOFs (rx, ry, rz) for each node - same rotation matrix
        rot_start_idx = start_idx + 3
        T[rot_start_idx : rot_start_idx + 3, rot_start_idx : rot_start_idx + 3] = R

    return T


def _is_unconstrained_system(model: Model) -> bool:
    """
    Detect if a system is unconstrained (no supports or insufficient constraints).

    A system is considered constrained if it has any supports defined.
    The solver will handle the specific constraint patterns appropriately.
    """
    if not model.supports:
        return True

    # If there are any supports defined, consider the system constrained
    # The solver will handle the specific constraint patterns appropriately
    return False


@dataclass
class AssembledMatrices:
    """Assembled system matrices with proper DOF elimination."""

    K_full: np.ndarray  # Full stiffness matrix
    M_full: np.ndarray  # Full mass matrix
    F_ext: np.ndarray  # External force vector
    free_dofs: List[int]  # List of free DOF indices
    constrained_dofs: List[int]  # List of constrained DOF indices
    nodal_masses: List[float]  # Nodal mass values
    point_id_to_idx: Dict[int, int]  # Point ID to index mapping


def _assemble_matrices(model: Model, x: Optional[np.ndarray] = None) -> AssembledMatrices:
    """Build global stiffness, mass, and load matrices with proper DOF elimination."""
    n_points = len(model.points)
    dof = n_points * 6
    K_full = np.zeros((dof, dof))
    M_full = np.zeros((dof, dof))
    F_ext = np.zeros(dof)

    # Create mapping from point ID to index
    point_id_to_idx = {p.id: i for i, p in enumerate(model.points)}

    # Compute current positions for all points
    if x is not None:
        current_positions = []
        for i, p in enumerate(model.points):
            dx = x[i * 6 + 0]
            dy = x[i * 6 + 1]
            dz = x[i * 6 + 2]
            current_positions.append((p.x.value + dx, p.y.value + dy, p.z.value + dz))
    else:
        current_positions = [(p.x.value, p.y.value, p.z.value) for p in model.points]

    # Initialize nodal masses and track connected nodes
    nodal_masses = [0.0 for _ in model.points]
    connected_nodes = set()

    # Always assemble stiffness matrix (even unconstrained systems have internal member stiffness)
    for m_idx, m in enumerate(model.members):
        if m.is_broken:
            continue

        if m.start not in point_id_to_idx or m.end not in point_id_to_idx:
            continue

        start_idx = point_id_to_idx[m.start]
        end_idx = point_id_to_idx[m.end]
        connected_nodes.add(start_idx)
        connected_nodes.add(end_idx)

        # Use CURRENT member geometry for stiffness matrix assembly
        start_pos = current_positions[start_idx]
        end_pos = current_positions[end_idx]
        dx = end_pos[0] - start_pos[0]
        dy = end_pos[1] - start_pos[1]
        dz = end_pos[2] - start_pos[2]
        L = (dx**2 + dy**2 + dz**2) ** 0.5

        if L == 0:
            continue

        # 3D frame element assembly (always use full 3D)
        E = float(m.E.value)
        A = float(m.A.value)
        Iz = float(m.Iz.value)  # Use Iz instead of I
        Iy = float(m.Iy.value)  # Use Iy explicitly
        G = float(m.G.value)
        J = float(m.J.value)
        k_local = _local_stiffness(E, A, Iz, Iy, G, J, L)
        T = _transformation_3d(start_pos, end_pos)
        k_global = T.T @ k_local @ T
        dof_map = []
        for i in range(6):
            dof_map.append(start_idx * 6 + i)
        for i in range(6):
            dof_map.append(end_idx * 6 + i)
        for i in range(12):
            for j in range(12):
                K_full[dof_map[i], dof_map[j]] += k_global[i, j]

        # Distribute member mass to nodes (using current geometry for mass)
        member_mass = float(m.density.value) * float(m.A.value) * L
        mass_per_node = member_mass / 2.0
        nodal_masses[start_idx] += mass_per_node
        nodal_masses[end_idx] += mass_per_node

    # Add explicit nodal mass if set
    for i, p in enumerate(model.points):
        explicit_mass = float(getattr(p, "mass", mass(0.0)).value)
        if explicit_mass > 0.0:
            nodal_masses[i] += explicit_mass
            connected_nodes.add(i)  # Mark as connected if it has explicit mass

    # Assign nodal masses to mass matrix
    for i, m_val in enumerate(nodal_masses):
        if m_val > 0.0:
            # Node has mass from members or explicit mass
            for j in range(3):  # x, y, z translational DOFs
                M_full[i * 6 + j, i * 6 + j] = m_val
            # Rotational DOFs: assign rotational inertia based on translational mass
            rot_inertia = max(m_val * 1.0, 1e-6)  # Minimum rotational inertia
            for j in range(3, 6):  # rx, ry, rz rotational DOFs
                M_full[i * 6 + j, i * 6 + j] = rot_inertia
        else:
            # Isolated node - assign small mass for numerical stability
            for j in range(3):
                M_full[i * 6 + j, i * 6 + j] = 1.0
            for j in range(3, 6):
                M_full[i * 6 + j, i * 6 + j] = 1e-6

    # Apply loads to F_ext vector
    for load in model.loads:
        if load.point in point_id_to_idx:
            idx = point_id_to_idx[load.point] * 6
            F_ext[idx] += float(load.fx.value)
            F_ext[idx + 1] += float(load.fy.value)
            F_ext[idx + 2] += float(load.fz.value)
            F_ext[idx + 3] += float(load.mx.value)
            F_ext[idx + 4] += float(load.my.value)
            F_ext[idx + 5] += float(load.mz.value)

    # Identify constrained DOFs for proper elimination
    constrained_dofs = []
    for sup in model.supports:
        if sup.point in point_id_to_idx:
            base = point_id_to_idx[sup.point] * 6
            constraints = [sup.ux, sup.uy, sup.uz, sup.rx, sup.ry, sup.rz]
            for i, constrained in enumerate(constraints):
                if constrained:
                    constrained_dofs.append(base + i)
                    # Apply large spring value for constrained DOFs and zero off-diagonals
                    K_full[base + i, base + i] = 1e12
                    # Zero out off-diagonal terms for this DOF
                    K_full[base + i, :] = 0.0
                    K_full[:, base + i] = 0.0
                    K_full[base + i, base + i] = 1e12  # Restore diagonal term

    # Create list of free DOFs
    all_dofs = set(range(dof))
    free_dofs = list(all_dofs - set(constrained_dofs))

    return AssembledMatrices(K_full=K_full, M_full=M_full, F_ext=F_ext, free_dofs=free_dofs, constrained_dofs=constrained_dofs, nodal_masses=nodal_masses, point_id_to_idx=point_id_to_idx)


def _create_reduced_system(assembled_matrices: AssembledMatrices) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Create reduced system matrices by eliminating constrained DOFs.

    Returns:
        K_reduced, M_reduced, F_reduced: Reduced matrices
    """
    K_full = assembled_matrices.K_full
    M_full = assembled_matrices.M_full
    F_full = assembled_matrices.F_ext
    free_dofs = assembled_matrices.free_dofs

    # Create reduced matrices
    n_free = len(free_dofs)
    K_reduced = np.zeros((n_free, n_free))
    M_reduced = np.zeros((n_free, n_free))
    F_reduced = np.zeros(n_free)

    # Map full system to reduced system
    for i, dof_i in enumerate(free_dofs):
        for j, dof_j in enumerate(free_dofs):
            K_reduced[i, j] = K_full[dof_i, dof_j]
            M_reduced[i, j] = M_full[dof_i, dof_j]
        F_reduced[i] = F_full[dof_i]

    return K_reduced, M_reduced, F_reduced


def _map_reduced_to_full(x_reduced: np.ndarray, v_reduced: np.ndarray, free_dofs: List[int], constrained_dofs: List[int], dof: int) -> Tuple[np.ndarray, np.ndarray]:
    """Map reduced state vectors back to full system."""
    x_full = np.zeros(dof)
    v_full = np.zeros(dof)

    # Map free DOFs
    for i, dof_idx in enumerate(free_dofs):
        x_full[dof_idx] = x_reduced[i]
        v_full[dof_idx] = v_reduced[i]

    # Constrained DOFs remain zero
    for dof_idx in constrained_dofs:
        x_full[dof_idx] = 0.0
        v_full[dof_idx] = 0.0

    return x_full, v_full


def _calculate_member_forces(model: Model, displacements: np.ndarray, point_id_to_idx: Dict[int, int]) -> Dict[int, Dict[str, float]]:
    """Calculate member forces from displacements. For unconstrained systems, these are not physically meaningful but are useful for visualization."""
    member_forces = {}

    # Always compute member forces, even for unconstrained systems
    # (For unconstrained systems, these are not physically meaningful)
    for m_idx, m in enumerate(model.members):
        if m.is_broken:
            continue

        if m.start not in point_id_to_idx or m.end not in point_id_to_idx:
            continue

        start_idx = point_id_to_idx[m.start]
        end_idx = point_id_to_idx[m.end]

        # Get current member geometry (consistent with stiffness assembly)
        start_point = model.points[start_idx]
        end_point = model.points[end_idx]

        # Calculate current positions including displacements
        start_dx = displacements[start_idx * 6]
        start_dy = displacements[start_idx * 6 + 1]
        start_dz = displacements[start_idx * 6 + 2]
        end_dx = displacements[end_idx * 6]
        end_dy = displacements[end_idx * 6 + 1]
        end_dz = displacements[end_idx * 6 + 2]

        start_pos = (start_point.x.value + start_dx, start_point.y.value + start_dy, start_point.z.value + start_dz)
        end_pos = (end_point.x.value + end_dx, end_point.y.value + end_dy, end_point.z.value + end_dz)

        dx = end_pos[0] - start_pos[0]
        dy = end_pos[1] - start_pos[1]
        dz = end_pos[2] - start_pos[2]
        L = (dx**2 + dy**2 + dz**2) ** 0.5

        if L == 0:
            continue

        # Check for unreasonable member length
        if L > 1e6:
            continue  # Skip this member if length is unreasonable

        # Additional check for extreme member lengths that could cause numerical issues
        if L > 1e3 or L < 1e-6:
            continue  # Skip this member if length is extreme

        # Get displacements at member ends
        start_dofs = start_idx * 6
        end_dofs = end_idx * 6
        u_start = displacements[start_dofs : start_dofs + 6]
        u_end = displacements[end_dofs : end_dofs + 6]

        # Calculate local stiffness matrix using current geometry
        E = float(m.E.value)
        A = float(m.A.value)
        Iz = float(m.Iz.value)
        Iy = float(m.Iy.value)
        G = float(m.G.value)
        J = float(m.J.value)

        try:
            k_local = _local_stiffness(E, A, Iz, Iy, G, J, L)
            T = _transformation_3d(start_pos, end_pos)

            # Transform displacements to local coordinates
            u_local = T @ np.concatenate([u_start, u_end])

            # Calculate local forces
            f_local = k_local @ u_local

            # Extract axial force (first element of local force vector)
            axial_force = f_local[0]
            shear_force = (f_local[1] ** 2 + f_local[2] ** 2) ** 0.5
            moment = (f_local[4] ** 2 + f_local[5] ** 2) ** 0.5

            member_forces[m_idx] = {"axial": axial_force, "shear": shear_force, "moment": moment}
        except (ValueError, np.linalg.LinAlgError):
            # Skip this member if there are numerical issues
            continue

    return member_forces


def _calculate_member_stresses(model: Model, member_forces: Dict[int, Dict[str, float]]) -> Dict[int, Dict[str, float]]:
    """Calculate stresses in all members."""
    member_stresses = {}

    for m_idx, m in enumerate(model.members):
        if m.is_broken or m_idx not in member_forces:
            continue

        forces = member_forces[m_idx]

        # Calculate stresses
        try:
            axial_stress = forces["axial"] / m.A.value if m.A.value != 0 else 0.0
            if not np.isfinite(axial_stress):
                axial_stress = 0.0
        except Exception:
            axial_stress = 0.0
        try:
            # Shear stress = shear_force / (area * shear_factor)
            # Compute shear factor based on section shape
            # For rectangular sections: k ≈ 1.5
            # For circular sections: k ≈ 1.33
            # For I-sections: k ≈ 1.0 (web area only)
            # For now, use rectangular factor as default (fix for Issue 11)
            shear_factor = NumericalConfig.RECTANGULAR_SHEAR_FACTOR
            shear_stress = forces["shear"] / (m.A.value * shear_factor) if m.A.value != 0 else 0.0
            if not np.isfinite(shear_stress):
                shear_stress = 0.0
        except Exception:
            shear_stress = 0.0
        try:
            # Bending stress = M * c / I, where c is distance to extreme fiber
            # Use proper section properties instead of estimated depth
            if m.A.value > 0 and m.Iz.value > 0:
                # Use the actual section properties for bending stress calculation
                # For rectangular sections, c = height/2
                c_y = float(m.y_max.value)  # Distance to extreme fiber in y-direction
                c_z = float(m.z_max.value)  # Distance to extreme fiber in z-direction

                # Bending stress about z-axis (major axis for rectangular sections)
                bending_stress_z = forces["moment"] * c_y / m.Iz.value

                # Bending stress about y-axis (minor axis)
                bending_stress_y = forces["moment"] * c_z / m.Iy.value

                # Use the maximum bending stress
                bending_stress = max(abs(bending_stress_z), abs(bending_stress_y))

                if not np.isfinite(bending_stress):
                    bending_stress = 0.0
            else:
                bending_stress = 0.0
        except Exception:
            bending_stress = 0.0
        member_stresses[m_idx] = {"tensile": max(axial_stress, 0), "compressive": max(-axial_stress, 0), "shear": abs(shear_stress), "bending": abs(bending_stress)}

    return member_stresses


def _check_member_failure(model: Model, member_stresses: Dict[int, Dict[str, float]], current_time: float) -> List[int]:
    """Check for member failures and return list of newly broken member indices."""
    newly_broken = []

    for m_idx, m in enumerate(model.members):
        if m.is_broken or m_idx not in member_stresses:
            continue

        stresses = member_stresses[m_idx]
        # Skip breakage check if all stresses are zero (no load yet)
        if all(abs(s) < NumericalConfig.STRESS_CHECK_THRESHOLD for s in stresses.values()):
            continue
        # Calculate ratios, guard against zero strength
        tensile_ratio = stresses["tensile"] / m.tensile_strength.value if m.tensile_strength.value != 0 else 0.0
        compressive_ratio = stresses["compressive"] / m.compressive_strength.value if m.compressive_strength.value != 0 else 0.0
        shear_ratio = stresses["shear"] / m.shear_strength.value if m.shear_strength.value != 0 else 0.0
        # Use proper bending strength (fix for Issue 10)
        bending_ratio = stresses["bending"] / m.bending_strength.value if m.bending_strength.value != 0 else 0.0

        if tensile_ratio > 1.0:
            m.is_broken = True
            m.break_time = current_time
            m.failure_mode = "tensile"
            newly_broken.append(m_idx)
        elif compressive_ratio > 1.0:
            m.is_broken = True
            m.break_time = current_time
            m.failure_mode = "compressive"
            newly_broken.append(m_idx)
        elif shear_ratio > 1.0:
            m.is_broken = True
            m.break_time = current_time
            m.failure_mode = "shear"
            newly_broken.append(m_idx)
        elif bending_ratio > 1.0:
            m.is_broken = True
            m.break_time = current_time
            m.failure_mode = "bending"
            newly_broken.append(m_idx)

    return newly_broken


def _get_load_at_time(load: Load, time: float) -> Tuple[float, float, float, float, float, float]:
    """Calculate load components at a specific time."""
    base_fx = float(load.fx.value)
    base_fy = float(load.fy.value)
    base_fz = float(load.fz.value)
    base_mx = float(load.mx.value)
    base_my = float(load.my.value)
    base_mz = float(load.mz.value)

    if load.time_function is None or load.time_function == "constant":
        return base_fx, base_fy, base_fz, base_mx, base_my, base_mz

    elif load.time_function == "ramp":
        if time < load.start_time:
            factor = 0.0
        elif time > load.start_time + load.duration:
            factor = 1.0
        else:
            factor = (time - load.start_time) / load.duration
        return (base_fx * factor, base_fy * factor, base_fz * factor, base_mx * factor, base_my * factor, base_mz * factor)

    elif load.time_function == "impulse":
        if load.start_time <= time <= load.start_time + load.duration:
            return base_fx, base_fy, base_fz, base_mx, base_my, base_mz
        else:
            return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0

    elif load.time_function == "sinusoidal":
        if time >= load.start_time:
            factor = np.sin(2 * np.pi * load.frequency * (time - load.start_time))
            return (base_fx * factor, base_fy * factor, base_fz * factor, base_mx * factor, base_my * factor, base_mz * factor)
        else:
            return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0

    return base_fx, base_fy, base_fz, base_mx, base_my, base_mz


def solve(model: Model, step: float = 0.01, simulation_time: float = 10.0, damping_ratio: float = 0.02, initial_displacements: Optional[Dict[int, Tuple[float, float, float, float, float, float]]] = None, gravity: Optional[float] = None) -> Results:
    """Solve the dynamic system using semi-implicit Euler integration."""
    # Reset all member breakage states at the beginning of each solve
    for member in model.members:
        member.is_broken = False
        member.break_time = None
        member.failure_mode = None

    # Create point ID to index mapping
    point_id_to_idx = {point.id: i for i, point in enumerate(model.points)}

    if not model.points:
        return Results(frames=[], unit_system=get_unit_manager().system)

    # Initialize time stepping
    time_steps = np.arange(0, simulation_time + step, step)
    time_steps = time_steps[time_steps <= simulation_time + 1e-10]

    # Use provided gravity or default
    g = gravity if gravity is not None else PhysicalConstants.GRAVITATIONAL_ACCELERATION

    # Initialize state vectors
    n_points = len(model.points)
    dof = n_points * 6
    point_id_to_idx = {p.id: i for i, p in enumerate(model.points)}

    # Check if system is constrained
    is_unconstrained = _is_unconstrained_system(model)

    # Pre-compute damping coefficients (fix for Issue 13)
    alpha, beta = _compute_rayleigh_damping_coefficients(damping_ratio)

    # Initialize displacement, velocity, and acceleration vectors
    x = np.zeros(dof)  # Displacements (start from zero)
    v = np.zeros(dof)  # Velocities (start from rest)
    a = np.zeros(dof)  # Accelerations

    # Apply initial displacements if provided
    if initial_displacements:
        for point_id, disp in initial_displacements.items():
            if point_id in point_id_to_idx:
                idx = point_id_to_idx[point_id] * 6
                x[idx] = disp[0]  # dx
                x[idx + 1] = disp[1]  # dy
                x[idx + 2] = disp[2]  # dz
                x[idx + 3] = disp[3]  # rx
                x[idx + 4] = disp[4]  # ry
                x[idx + 5] = disp[5]  # rz

    frames = []
    broken_members_this_step = []

    mass_matrix_printed = False
    # Time integration loop
    for t_idx, t in enumerate(time_steps):
        issues = []

        # Assemble matrices for current configuration
        assembled_matrices = _assemble_matrices(model, x)
        K_full = assembled_matrices.K_full
        M_full = assembled_matrices.M_full
        F_ext = assembled_matrices.F_ext
        free_dofs = assembled_matrices.free_dofs
        constrained_dofs = assembled_matrices.constrained_dofs
        nodal_masses = assembled_matrices.nodal_masses
        point_id_to_idx = assembled_matrices.point_id_to_idx

        # Handle empty or singular system
        if K_full.size == 0 or np.linalg.matrix_rank(K_full) < K_full.shape[0]:
            pass

        # Calculate time-varying loads and add to F_ext
        F_time = F_ext.copy()  # Start with static loads from assembled matrices
        for load in model.loads:
            if load.point in point_id_to_idx:
                idx = point_id_to_idx[load.point] * 6
                fx, fy, fz, mx, my, mz = _get_load_at_time(load, t)
                # Add time-varying component (subtract static component first)
                F_time[idx] += fx - float(load.fx.value)
                F_time[idx + 1] += fy - float(load.fy.value)
                F_time[idx + 2] += fz - float(load.fz.value)
                F_time[idx + 3] += mx - float(load.mx.value)
                F_time[idx + 4] += my - float(load.my.value)
                F_time[idx + 5] += mz - float(load.mz.value)

        # Add gravity forces to F_time (only to free DOFs)
        constrained_dof_set = set(constrained_dofs)
        for i, m_val in enumerate(nodal_masses):
            if m_val > 0.0:
                dof_y = i * 6 + 1  # y-direction DOF
                if dof_y not in constrained_dof_set:
                    gravity_force = -m_val * g  # negative y direction (downward)
                    F_time[dof_y] += gravity_force

        if not is_unconstrained:
            K_reduced, M_reduced, F_reduced = _create_reduced_system(assembled_matrices)
            # Update F_reduced with time-varying loads and gravity
            F_reduced = np.zeros(len(free_dofs))
            for i, dof_idx in enumerate(free_dofs):
                F_reduced[i] = F_time[dof_idx]

            x_reduced = np.array([x[dof_idx] for dof_idx in free_dofs])
            v_reduced = np.array([v[dof_idx] for dof_idx in free_dofs])
            C_reduced = alpha * M_reduced + beta * K_reduced
            F_eff_reduced = F_reduced - K_reduced @ x_reduced - C_reduced @ v_reduced
            try:
                a_reduced = np.linalg.solve(M_reduced, F_eff_reduced)
            except np.linalg.LinAlgError:
                a_reduced = np.zeros_like(F_eff_reduced)
                issues.append(f"Singular mass matrix at time {t}")
            v_new_reduced = v_reduced + a_reduced * step
            x_new_reduced = x_reduced + v_new_reduced * step
            x_new, v_new = _map_reduced_to_full(x_new_reduced, v_new_reduced, free_dofs, constrained_dofs, dof)
            a_full = np.zeros(dof)
            for i, dof_idx in enumerate(free_dofs):
                a_full[dof_idx] = a_reduced[i]
        else:
            C = alpha * M_full + beta * K_full
            F_eff = F_time - K_full @ x - C @ v
            try:
                a = np.linalg.solve(M_full, F_eff)
            except np.linalg.LinAlgError:
                a = np.zeros_like(F_eff)
                issues.append(f"Singular mass matrix at time {t}")
            v_new = v + a * step
            x_new = x + v_new * step
            a_full = a

        # Calculate reactions at supports only
        try:
            assembled_matrices_new = _assemble_matrices(model, x_new)
            internal_forces = assembled_matrices_new.K_full @ x_new
            reactions_vec = np.zeros_like(x_new)
            for sup in model.supports:
                if sup.point in point_id_to_idx:
                    base_idx = point_id_to_idx[sup.point] * 6
                    constraints = [sup.ux, sup.uy, sup.uz, sup.rx, sup.ry, sup.rz]
                    for i, constrained in enumerate(constraints):
                        if constrained:
                            reaction = internal_forces[base_idx + i]
                            reactions_vec[base_idx + i] = reaction
            if np.any(np.isnan(reactions_vec)) or np.any(np.isinf(reactions_vec)):
                reactions_vec = np.zeros_like(reactions_vec)
                issues.append(f"Numerical instability in reactions at time {t}")
        except Exception:
            reactions_vec = np.zeros_like(x_new)
            issues.append(f"Error calculating reactions at time {t}")

        member_forces = _calculate_member_forces(model, x_new, point_id_to_idx)
        member_stresses = _calculate_member_stresses(model, member_forces)

        # Check for member failures at every step (fix for Issue 12)
        newly_broken = _check_member_failure(model, member_stresses, t)
        broken_members_this_step.extend(newly_broken)

        velocities = {}
        accelerations = {}
        reactions = {}
        positions = {}
        for i, point in enumerate(model.points):
            abs_x = point.x.value + x_new[i * 6]
            abs_y = point.y.value + x_new[i * 6 + 1]
            abs_z = point.z.value + x_new[i * 6 + 2]
            positions[point.id] = (abs_x, abs_y, abs_z)
            velocities[point.id] = (v_new[i * 6], v_new[i * 6 + 1], v_new[i * 6 + 2], v_new[i * 6 + 3], v_new[i * 6 + 4], v_new[i * 6 + 5])
            accelerations[point.id] = (a_full[i * 6], a_full[i * 6 + 1], a_full[i * 6 + 2], a_full[i * 6 + 3], a_full[i * 6 + 4], a_full[i * 6 + 5])
            reactions[point.id] = (reactions_vec[i * 6], reactions_vec[i * 6 + 1], reactions_vec[i * 6 + 2], reactions_vec[i * 6 + 3], reactions_vec[i * 6 + 4], reactions_vec[i * 6 + 5])
        frame = Frame(time=round(t, 4), positions=positions, velocities=velocities, accelerations=accelerations, reactions=reactions, member_forces=member_forces, member_stresses=member_stresses, broken_members=broken_members_this_step.copy(), issues=issues)
        if t_idx == 0:
            for point_id in velocities:
                velocities[point_id] = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
            frame.velocities = velocities
        frames.append(frame)
        x = x_new
        v = v_new
        # Check for numerical instabilities and limit extreme values
        if np.any(np.isnan(v_new)) or np.any(np.isinf(v_new)):
            frame.issues.append(f"Numerical instability in velocity at time {t}")
            v_new = np.nan_to_num(v_new, nan=0.0, posinf=0.0, neginf=0.0)
        if np.any(np.isnan(x_new)) or np.any(np.isinf(x_new)):
            frame.issues.append(f"Numerical instability in displacement at time {t}")
            x_new = np.nan_to_num(x_new, nan=0.0, posinf=0.0, neginf=0.0)

        # Limit extreme velocities and displacements
        if np.any(np.abs(v_new) > NumericalConfig.MAX_VELOCITY):
            v_new = np.clip(v_new, -NumericalConfig.MAX_VELOCITY, NumericalConfig.MAX_VELOCITY)
            frame.issues.append(f"Velocity limited at time {t}")
        if np.any(np.abs(x_new) > NumericalConfig.MAX_DISPLACEMENT):
            x_new = np.clip(x_new, -NumericalConfig.MAX_DISPLACEMENT, NumericalConfig.MAX_DISPLACEMENT)
            frame.issues.append(f"Displacement limited at time {t}")

        # Check for runaway displacements and stop simulation
        max_disp = np.max(np.abs(x_new))
        if max_disp > 1e6:
            frame.issues.append(f"Very large displacements detected: {max_disp:.2e}")
            break

    unit_manager = get_unit_manager()
    return Results(frames=frames, unit_system=unit_manager.system, final_time=time_steps[-1] if time_steps.size > 0 else 0.0, total_frames=len(frames))
