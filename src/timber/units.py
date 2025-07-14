"""
Unit-aware system for timber structural analysis.

This module provides unit-aware quantities with SI base unit vectors that can
handle multiplication, division, addition, and subtraction with proper unit arithmetic.
All internal calculations are performed in SI units, with conversion only for display.
"""

from dataclasses import dataclass
from typing import Dict, Literal, Union

# Unit system types
UnitSystem = Literal["metric", "imperial"]

# SI Base units: [length, mass, time, current, temperature, amount, luminous_intensity]
SI_BASE_UNITS = ["m", "kg", "s", "A", "K", "mol", "cd"]


@dataclass
class UnitVector:
    """Represents a unit as a vector of SI base unit exponents."""

    # Exponents for [length, mass, time, current, temperature, amount, luminous_intensity]
    length: int = 0
    mass: int = 0
    time: int = 0
    current: int = 0
    temperature: int = 0
    amount: int = 0
    luminous_intensity: int = 0

    def __post_init__(self):
        """Convert to tuple for immutability and easier comparison."""
        self._vector = (
            self.length,
            self.mass,
            self.time,
            self.current,
            self.temperature,
            self.amount,
            self.luminous_intensity,
        )

    def __add__(self, other: "UnitVector") -> "UnitVector":
        """Add unit vectors (for multiplication of quantities)."""
        return UnitVector(
            length=self.length + other.length,
            mass=self.mass + other.mass,
            time=self.time + other.time,
            current=self.current + other.current,
            temperature=self.temperature + other.temperature,
            amount=self.amount + other.amount,
            luminous_intensity=self.luminous_intensity + other.luminous_intensity,
        )

    def __sub__(self, other: "UnitVector") -> "UnitVector":
        """Subtract unit vectors (for division of quantities)."""
        return UnitVector(
            length=self.length - other.length,
            mass=self.mass - other.mass,
            time=self.time - other.time,
            current=self.current - other.current,
            temperature=self.temperature - other.temperature,
            amount=self.amount - other.amount,
            luminous_intensity=self.luminous_intensity - other.luminous_intensity,
        )

    def __neg__(self) -> "UnitVector":
        """Negate unit vector (for division of quantities)."""
        return UnitVector(
            length=-self.length,
            mass=-self.mass,
            time=-self.time,
            current=-self.current,
            temperature=-self.temperature,
            amount=-self.amount,
            luminous_intensity=-self.luminous_intensity,
        )

    def __eq__(self, other: "UnitVector") -> bool:
        """Check if unit vectors are equal."""
        return self._vector == other._vector

    def __hash__(self):
        """Make unit vectors hashable."""
        return hash(self._vector)

    def __str__(self) -> str:
        """String representation of the unit vector."""
        return f"UnitVector({self._vector})"

    def __repr__(self) -> str:
        """Detailed string representation."""
        return f"UnitVector(length={self.length}, mass={self.mass}, time={self.time}, current={self.current}, temperature={self.temperature}, amount={self.amount}, luminous_intensity={self.luminous_intensity})"


# Predefined unit vectors for common quantities
UNIT_VECTORS = {
    # Dimensionless
    "dimensionless": UnitVector(),
    # Length units
    "m": UnitVector(length=1),
    "mm": UnitVector(length=1),
    "cm": UnitVector(length=1),
    "ft": UnitVector(length=1),
    "in": UnitVector(length=1),
    # Mass units
    "kg": UnitVector(mass=1),
    "g": UnitVector(mass=1),
    # Time units
    "s": UnitVector(time=1),
    "min": UnitVector(time=1),
    "hr": UnitVector(time=1),
    # Force units (mass * length / time^2)
    "N": UnitVector(length=1, mass=1, time=-2),
    "kN": UnitVector(length=1, mass=1, time=-2),
    "lb": UnitVector(length=1, mass=1, time=-2),  # pound-force
    "kip": UnitVector(length=1, mass=1, time=-2),
    # Moment units (force * length = mass * length^2 / time^2)
    "N·m": UnitVector(length=2, mass=1, time=-2),
    "kN·m": UnitVector(length=2, mass=1, time=-2),
    "lb·ft": UnitVector(length=2, mass=1, time=-2),
    "kip·ft": UnitVector(length=2, mass=1, time=-2),
    # Stress units (force / area = mass / (length * time^2))
    "Pa": UnitVector(length=-1, mass=1, time=-2),
    "MPa": UnitVector(length=-1, mass=1, time=-2),
    "GPa": UnitVector(length=-1, mass=1, time=-2),
    "psi": UnitVector(length=-1, mass=1, time=-2),
    "ksi": UnitVector(length=-1, mass=1, time=-2),
    # Area units (length^2)
    "m²": UnitVector(length=2),
    "mm²": UnitVector(length=2),
    "ft²": UnitVector(length=2),
    "in²": UnitVector(length=2),
    # Moment of inertia units (length^4)
    "m⁴": UnitVector(length=4),
    "mm⁴": UnitVector(length=4),
    "in⁴": UnitVector(length=4),
    # Acceleration units (length / time^2)
    "m/s²": UnitVector(length=1, time=-2),
    "ft/s²": UnitVector(length=1, time=-2),
    # Velocity units (length / time)
    "m/s": UnitVector(length=1, time=-1),
    "ft/s": UnitVector(length=1, time=-1),
}


@dataclass
class UnitQuantity:
    """A quantity with a value and unit vector."""

    value: float  # Value in SI base units
    unit_vector: UnitVector  # Unit vector representing the quantity's units

    def __post_init__(self):
        """Ensure unit_vector is a UnitVector instance."""
        if isinstance(self.unit_vector, str):
            self.unit_vector = UNIT_VECTORS.get(self.unit_vector, UnitVector())
        elif isinstance(self.unit_vector, (list, tuple)):
            # Convert list/tuple to UnitVector
            if len(self.unit_vector) >= 7:
                self.unit_vector = UnitVector(*self.unit_vector[:7])
            else:
                # Pad with zeros if shorter than 7
                padded = list(self.unit_vector) + [0] * (7 - len(self.unit_vector))
                self.unit_vector = UnitVector(*padded)

    def __mul__(self, other: Union["UnitQuantity", float, int]) -> "UnitQuantity":
        """Multiply two quantities or multiply by a scalar."""
        if isinstance(other, (int, float)):
            return UnitQuantity(self.value * other, self.unit_vector)
        elif isinstance(other, UnitQuantity):
            return UnitQuantity(self.value * other.value, self.unit_vector + other.unit_vector)
        else:
            return NotImplemented

    def __rmul__(self, other: Union[float, int]) -> "UnitQuantity":
        """Right multiplication by scalar."""
        return self * other

    def __truediv__(self, other: Union["UnitQuantity", float, int]) -> "UnitQuantity":
        """Divide two quantities or divide by a scalar."""
        if isinstance(other, (int, float)):
            return UnitQuantity(self.value / other, self.unit_vector)
        elif isinstance(other, UnitQuantity):
            return UnitQuantity(self.value / other.value, self.unit_vector - other.unit_vector)
        else:
            return NotImplemented

    def __rtruediv__(self, other: Union[float, int]) -> "UnitQuantity":
        """Right division by scalar."""
        return UnitQuantity(other / self.value, -self.unit_vector)

    def __add__(self, other: "UnitQuantity") -> "UnitQuantity":
        """Add two quantities (must have same unit vector)."""
        if isinstance(other, UnitQuantity):
            if self.unit_vector == other.unit_vector:
                return UnitQuantity(self.value + other.value, self.unit_vector)
            else:
                raise ValueError(f"Cannot add quantities with different units: {self.unit_vector} and {other.unit_vector}")
        else:
            return NotImplemented

    def __sub__(self, other: "UnitQuantity") -> "UnitQuantity":
        """Subtract two quantities (must have same unit vector)."""
        if isinstance(other, UnitQuantity):
            if self.unit_vector == other.unit_vector:
                return UnitQuantity(self.value - other.value, self.unit_vector)
            else:
                raise ValueError(f"Cannot subtract quantities with different units: {self.unit_vector} and {other.unit_vector}")
        else:
            return NotImplemented

    def __eq__(self, other: "UnitQuantity") -> bool:
        """Check if quantities are equal."""
        if isinstance(other, UnitQuantity):
            return self.value == other.value and self.unit_vector == other.unit_vector
        return False

    def __str__(self) -> str:
        """String representation."""
        return f"{self.value} {self.unit_vector}"

    def __repr__(self) -> str:
        """Detailed string representation."""
        return f"UnitQuantity(value={self.value}, unit_vector={self.unit_vector})"


# Convenience functions to create unit quantities
def length(value: float, unit: str = "m") -> UnitQuantity:
    """Create a length quantity."""
    return UnitQuantity(value, UNIT_VECTORS[unit])


def force(value: float, unit: str = "N") -> UnitQuantity:
    """Create a force quantity."""
    return UnitQuantity(value, UNIT_VECTORS[unit])


def moment(value: float, unit: str = "N·m") -> UnitQuantity:
    """Create a moment quantity."""
    return UnitQuantity(value, UNIT_VECTORS[unit])


def stress(value: float, unit: str = "Pa") -> UnitQuantity:
    """Create a stress quantity."""
    return UnitQuantity(value, UNIT_VECTORS[unit])


def area(value: float, unit: str = "m²") -> UnitQuantity:
    """Create an area quantity."""
    return UnitQuantity(value, UNIT_VECTORS[unit])


def moment_of_inertia(value: float, unit: str = "m⁴") -> UnitQuantity:
    """Create a moment of inertia quantity."""
    return UnitQuantity(value, UNIT_VECTORS[unit])


def acceleration(value: float, unit: str = "m/s²") -> UnitQuantity:
    """Create an acceleration quantity."""
    return UnitQuantity(value, UNIT_VECTORS[unit])


def mass(value: float, unit: str = "kg") -> UnitQuantity:
    """Create a mass quantity."""
    return UnitQuantity(value, UNIT_VECTORS[unit])


def velocity(value: float, unit: str = "m/s") -> UnitQuantity:
    """Create a velocity quantity."""
    return UnitQuantity(value, UNIT_VECTORS[unit])


# Unit conversion factors (to convert from display units to SI base units)
CONVERSION_FACTORS = {
    # Length conversions to meters
    "mm": 0.001,
    "cm": 0.01,
    "ft": 0.3048,
    "in": 0.0254,
    # Force conversions to newtons
    "kN": 1000.0,
    "lb": 4.44822,  # pound-force
    "kip": 4448.22,
    # Moment conversions to newton-meters
    "kN·m": 1000.0,
    "lb·ft": 1.35582,
    "kip·ft": 1355.82,
    # Stress conversions to pascals
    "MPa": 1e6,
    "GPa": 1e9,
    "psi": 6894.76,
    "ksi": 6894760.0,
    # Area conversions to square meters
    "mm²": 1e-6,
    "ft²": 0.092903,
    "in²": 6.4516e-4,
    # Moment of inertia conversions to meter^4
    "mm⁴": 1e-12,
    "in⁴": 4.1623e-7,
    # Acceleration conversions to m/s²
    "ft/s²": 0.3048,
}


@dataclass
class UnitConversion:
    """Unit conversion factors and display information."""

    factor: float  # Conversion factor to SI base unit
    symbol: str  # Unit symbol for display
    precision: int = 3  # Decimal places for display


class UnitSystemManager:
    """Manages unit conversions and display for metric and imperial systems.

    All internal calculations are performed in SI units. This class only handles
    conversion for display purposes.
    """

    def __init__(self, system: UnitSystem = "metric"):
        self.system: UnitSystem = system
        self._conversions = self._setup_conversions()

    def _setup_conversions(self) -> Dict[str, Dict[str, UnitConversion]]:
        """Setup conversion factors for all unit types to SI base units."""
        return {
            # Length conversions to meters
            "length": {
                # SI base unit
                "m": UnitConversion(1.0, "m", 3),
                # Metric display units
                "mm": UnitConversion(0.001, "mm", 3),
                "cm": UnitConversion(0.01, "cm", 2),
                # Imperial display units
                "ft": UnitConversion(0.3048, "ft", 3),
                "in": UnitConversion(0.0254, "in", 2),
            },
            # Force conversions to newtons
            "force": {
                # SI base unit
                "N": UnitConversion(1.0, "N", 1),
                # Metric display units
                "kN": UnitConversion(1000.0, "kN", 3),
                # Imperial display units
                "lb": UnitConversion(4.44822, "lb", 3),
                "kip": UnitConversion(4448.22, "kip", 3),
            },
            # Moment conversions to newton-meters
            "moment": {
                # SI base unit
                "N·m": UnitConversion(1.0, "N·m", 1),
                # Metric display units
                "kN·m": UnitConversion(1000.0, "kN·m", 3),
                # Imperial display units
                "lb·ft": UnitConversion(1.35582, "lb·ft", 3),
                "kip·ft": UnitConversion(1355.82, "kip·ft", 3),
            },
            # Stress/modulus conversions to pascals
            "stress": {
                # SI base unit
                "Pa": UnitConversion(1.0, "Pa", 0),
                # Metric display units
                "MPa": UnitConversion(1e6, "MPa", 3),
                "GPa": UnitConversion(1e9, "GPa", 3),
                # Imperial display units
                "psi": UnitConversion(6894.76, "psi", 0),
                "ksi": UnitConversion(6894760.0, "ksi", 3),
            },
            # Area conversions to square meters
            "area": {
                # SI base unit
                "m²": UnitConversion(1.0, "m²", 6),
                # Metric display units
                "mm²": UnitConversion(1e-6, "mm²", 3),
                # Imperial display units
                "ft²": UnitConversion(0.092903, "ft²", 4),
                "in²": UnitConversion(6.4516e-4, "in²", 4),
            },
            # Moment of inertia conversions to meter^4
            "moment_of_inertia": {
                # SI base unit
                "m⁴": UnitConversion(1.0, "m⁴", 9),
                # Metric display units
                "mm⁴": UnitConversion(1e-12, "mm⁴", 3),
                # Imperial display units
                "in⁴": UnitConversion(4.1623e-7, "in⁴", 6),
            },
            # Acceleration conversions to m/s²
            "acceleration": {
                # SI base unit
                "m/s²": UnitConversion(1.0, "m/s²", 2),
                # Imperial display units
                "ft/s²": UnitConversion(0.3048, "ft/s²", 2),
            },
        }

    def get_conversion(self, unit_type: str, unit: str) -> UnitConversion:
        """Get conversion information for a specific unit."""
        return self._conversions[unit_type][unit]

    def get_preferred_unit(self, unit_type: str) -> str:
        """Get the preferred unit for display in the current system."""
        preferred_units = {
            "length": "m" if self.system == "metric" else "ft",
            "force": "kN" if self.system == "metric" else "lb",
            "moment": "kN·m" if self.system == "metric" else "lb·ft",
            "stress": "GPa" if self.system == "metric" else "ksi",
            "area": "mm²" if self.system == "metric" else "in²",
            "moment_of_inertia": "mm⁴" if self.system == "metric" else "in⁴",
            "acceleration": "m/s²" if self.system == "metric" else "ft/s²",
        }
        return preferred_units[unit_type]

    def convert_to_display(self, value: float, unit_type: str) -> tuple[float, str]:
        """Convert a value from SI base units to the preferred display unit.

        Args:
            value: Value in SI base units
            unit_type: Type of unit (length, force, etc.)

        Returns:
            Tuple of (display_value, unit_symbol)
        """
        preferred_unit = self.get_preferred_unit(unit_type)
        conversion = self.get_conversion(unit_type, preferred_unit)

        # Convert from SI base units to display units
        display_value = value / conversion.factor

        return display_value, conversion.symbol

    def convert_from_display(self, value: float, unit_type: str) -> float:
        """Convert a value from display units to SI base units.

        Args:
            value: Value in display units
            unit_type: Type of unit (length, force, etc.)

        Returns:
            Value in SI base units
        """
        preferred_unit = self.get_preferred_unit(unit_type)
        conversion = self.get_conversion(unit_type, preferred_unit)

        # Convert from display units to SI base units
        return value * conversion.factor

    def format_value(self, value: float, unit_type: str) -> str:
        """Format a value with appropriate units for display.

        Args:
            value: Value in SI base units
            unit_type: Type of unit (length, force, etc.)

        Returns:
            Formatted string with value and units
        """
        display_value, unit_symbol = self.convert_to_display(value, unit_type)
        conversion = self.get_conversion(unit_type, self.get_preferred_unit(unit_type))
        return f"{display_value:.{conversion.precision}f} {unit_symbol}"

    def parse_value(self, text: str, unit_type: str) -> float:
        """Parse a value with units from text input.

        Args:
            text: Text containing value and optional units
            unit_type: Type of unit (length, force, etc.)

        Returns:
            Value in SI base units

        Raises:
            ValueError: If text cannot be parsed
        """
        text = text.strip()

        # Find the unit symbol (try longest matches first)
        unit_symbol = None
        available_units = self._conversions[unit_type]

        # Sort by symbol length (longest first) to match "kN·m" before "N"
        sorted_units = sorted(available_units.items(), key=lambda x: len(x[1].symbol), reverse=True)

        for unit, conversion in sorted_units:
            if conversion.symbol in text:
                unit_symbol = unit
                break

        if unit_symbol is None:
            # No unit found, assume preferred unit
            unit_symbol = self.get_preferred_unit(unit_type)
            value_text = text
        else:
            # Extract value before unit
            conversion = self.get_conversion(unit_type, unit_symbol)
            value_text = text.replace(conversion.symbol, "").strip()

        try:
            value = float(value_text)
            # Convert from the specified unit to SI base units
            return value * self.get_conversion(unit_type, unit_symbol).factor
        except ValueError:
            raise ValueError(f"Invalid value format: {text}")


# Global unit system manager
_unit_manager = UnitSystemManager("metric")


def get_unit_manager() -> UnitSystemManager:
    """Get the global unit system manager."""
    return _unit_manager


def set_unit_system(system: UnitSystem):
    """Set the global unit system."""
    global _unit_manager
    _unit_manager = UnitSystemManager(system)


def get_unit_system() -> UnitSystem:
    """Get the current global unit system."""
    return _unit_manager.system


# Convenience functions for common conversions
def format_length(value: float) -> str:
    """Format a length value for display."""
    return _unit_manager.format_value(value, "length")


def format_force(value: float) -> str:
    """Format a force value for display."""
    return _unit_manager.format_value(value, "force")


def format_moment(value: float) -> str:
    """Format a moment value for display."""
    return _unit_manager.format_value(value, "moment")


def format_stress(value: float) -> str:
    """Format a stress value for display."""
    return _unit_manager.format_value(value, "stress")


def format_area(value: float) -> str:
    """Format an area value for display."""
    return _unit_manager.format_value(value, "area")


def format_moment_of_inertia(value: float) -> str:
    """Format a moment of inertia value for display."""
    return _unit_manager.format_value(value, "moment_of_inertia")


def format_acceleration(value: float) -> str:
    """Format an acceleration value for display."""
    return _unit_manager.format_value(value, "acceleration")


# Parsing functions
def parse_length(text: str) -> float:
    """Parse a length value from text."""
    return _unit_manager.parse_value(text, "length")


def parse_force(text: str) -> float:
    """Parse a force value from text."""
    return _unit_manager.parse_value(text, "force")


def parse_moment(text: str) -> float:
    """Parse a moment value from text."""
    return _unit_manager.parse_value(text, "moment")


def parse_stress(text: str) -> float:
    """Parse a stress value from text."""
    return _unit_manager.parse_value(text, "stress")


def parse_area(text: str) -> float:
    """Parse an area value from text."""
    return _unit_manager.parse_value(text, "area")


def parse_moment_of_inertia(text: str) -> float:
    """Parse a moment of inertia value from text."""
    return _unit_manager.parse_value(text, "moment_of_inertia")


def parse_acceleration(text: str) -> float:
    """Parse an acceleration value from text."""
    return _unit_manager.parse_value(text, "acceleration")


# Frontend-friendly conversion functions
def convert_to_display(value: float, unit_type: str) -> tuple[float, str]:
    """Convert a value from SI base units to display units.

    Args:
        value: Value in SI base units
        unit_type: Type of unit (length, force, etc.)

    Returns:
        Tuple of (display_value, unit_symbol)
    """
    return _unit_manager.convert_to_display(value, unit_type)


def convert_from_display(value: float, unit_type: str) -> float:
    """Convert a value from display units to SI base units.

    Args:
        value: Value in display units
        unit_type: Type of unit (length, force, etc.)

    Returns:
        Value in SI base units
    """
    return _unit_manager.convert_from_display(value, unit_type)


def get_display_unit(unit_type: str) -> str:
    """Get the display unit symbol for the current unit system.

    Args:
        unit_type: Type of unit (length, force, etc.)

    Returns:
        Unit symbol for display
    """
    preferred_unit = _unit_manager.get_preferred_unit(unit_type)
    return _unit_manager.get_conversion(unit_type, preferred_unit).symbol


def get_unit_conversion_info() -> dict:
    """Get comprehensive unit conversion information for the frontend.

    Returns:
        Dictionary with conversion factors and display units for all unit types
    """
    unit_types = [
        "length",
        "force",
        "moment",
        "stress",
        "area",
        "moment_of_inertia",
        "acceleration",
    ]
    info = {}

    for unit_type in unit_types:
        preferred_unit = _unit_manager.get_preferred_unit(unit_type)
        conversion = _unit_manager.get_conversion(unit_type, preferred_unit)
        info[unit_type] = {
            "display_unit": preferred_unit,
            "symbol": conversion.symbol,
            "factor": conversion.factor,  # Factor to convert from SI to display
            "precision": conversion.precision,
        }

    return info
