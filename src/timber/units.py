"""
Unit system for timber structural analysis.

This module provides unit conversion utilities and unit-aware data structures
for handling metric and imperial units throughout the application.
"""

from dataclasses import dataclass
from typing import Literal, Dict, Any, Optional
import math

# Unit system types
UnitSystem = Literal["metric", "imperial"]

# Unit types
class Units:
    """Unit constants for different physical quantities."""
    
    # Length units
    METER = "m"
    MILLIMETER = "mm"
    CENTIMETER = "cm"
    FOOT = "ft"
    INCH = "in"
    
    # Force units
    NEWTON = "N"
    KILONEWTON = "kN"
    POUND = "lb"
    KIP = "kip"
    
    # Moment units
    NEWTON_METER = "N·m"
    KILONEWTON_METER = "kN·m"
    POUND_FOOT = "lb·ft"
    KIP_FOOT = "kip·ft"
    
    # Stress/Modulus units
    PASCAL = "Pa"
    MEGAPASCAL = "MPa"
    GIGAPASCAL = "GPa"
    PSI = "psi"
    KSI = "ksi"
    
    # Area units
    SQUARE_METER = "m²"
    SQUARE_MILLIMETER = "mm²"
    SQUARE_INCH = "in²"
    
    # Moment of inertia units
    METER_TO_FOURTH = "m⁴"
    MILLIMETER_TO_FOURTH = "mm⁴"
    INCH_TO_FOURTH = "in⁴"
    
    # Acceleration units
    METER_PER_SECOND_SQUARED = "m/s²"
    FOOT_PER_SECOND_SQUARED = "ft/s²"


@dataclass
class UnitConversion:
    """Unit conversion factors and display information."""
    factor: float  # Conversion factor to base unit
    symbol: str    # Unit symbol for display
    precision: int = 3  # Decimal places for display


class UnitSystemManager:
    """Manages unit conversions and display for metric and imperial systems."""
    
    def __init__(self, system: UnitSystem = "metric"):
        self.system: UnitSystem = system
        self._conversions = self._setup_conversions()
    
    def _setup_conversions(self) -> Dict[str, Dict[str, Dict[str, UnitConversion]]]:
        """Setup conversion factors for all unit types."""
        return {
            "length": {
                "metric": {
                    Units.METER: UnitConversion(1.0, "m", 3),
                    Units.MILLIMETER: UnitConversion(0.001, "mm", 3),
                    Units.CENTIMETER: UnitConversion(0.01, "cm", 2),
                },
                "imperial": {
                    Units.METER: UnitConversion(1.0, "m", 3),  # Base unit
                    Units.FOOT: UnitConversion(0.3048, "ft", 3),
                    Units.INCH: UnitConversion(0.0254, "in", 2),
                }
            },
            "force": {
                "metric": {
                    Units.NEWTON: UnitConversion(1.0, "N", 1),
                    Units.KILONEWTON: UnitConversion(1000.0, "kN", 3),
                },
                "imperial": {
                    Units.NEWTON: UnitConversion(1.0, "N", 1),  # Base unit
                    Units.POUND: UnitConversion(4.44822, "lb", 1),
                    Units.KIP: UnitConversion(4448.22, "kip", 3),
                }
            },
            "moment": {
                "metric": {
                    Units.NEWTON_METER: UnitConversion(1.0, "N·m", 1),
                    Units.KILONEWTON_METER: UnitConversion(1000.0, "kN·m", 3),
                },
                "imperial": {
                    Units.NEWTON_METER: UnitConversion(1.0, "N·m", 1),  # Base unit
                    Units.POUND_FOOT: UnitConversion(1.35582, "lb·ft", 1),
                    Units.KIP_FOOT: UnitConversion(1355.82, "kip·ft", 3),
                }
            },
            "stress": {
                "metric": {
                    Units.PASCAL: UnitConversion(1.0, "Pa", 0),
                    Units.MEGAPASCAL: UnitConversion(1e6, "MPa", 3),
                    Units.GIGAPASCAL: UnitConversion(1e9, "GPa", 3),
                },
                "imperial": {
                    Units.PASCAL: UnitConversion(1.0, "Pa", 0),  # Base unit
                    Units.PSI: UnitConversion(6894.76, "psi", 0),
                    Units.KSI: UnitConversion(6894760.0, "ksi", 3),
                }
            },
            "area": {
                "metric": {
                    Units.SQUARE_METER: UnitConversion(1.0, "m²", 6),
                    Units.SQUARE_MILLIMETER: UnitConversion(1e-6, "mm²", 3),
                },
                "imperial": {
                    Units.SQUARE_METER: UnitConversion(1.0, "m²", 6),  # Base unit
                    Units.SQUARE_INCH: UnitConversion(6.4516e-4, "in²", 4),
                }
            },
            "moment_of_inertia": {
                "metric": {
                    Units.METER_TO_FOURTH: UnitConversion(1.0, "m⁴", 9),
                    Units.MILLIMETER_TO_FOURTH: UnitConversion(1e-12, "mm⁴", 3),
                },
                "imperial": {
                    Units.METER_TO_FOURTH: UnitConversion(1.0, "m⁴", 9),  # Base unit
                    Units.INCH_TO_FOURTH: UnitConversion(4.1623e-7, "in⁴", 6),
                }
            },
            "acceleration": {
                "metric": {
                    Units.METER_PER_SECOND_SQUARED: UnitConversion(1.0, "m/s²", 2),
                },
                "imperial": {
                    Units.METER_PER_SECOND_SQUARED: UnitConversion(1.0, "m/s²", 2),  # Base unit
                    Units.FOOT_PER_SECOND_SQUARED: UnitConversion(0.3048, "ft/s²", 2),
                }
            }
        }
    
    def get_conversion(self, unit_type: str, unit: str) -> UnitConversion:
        """Get conversion information for a specific unit."""
        return self._conversions[unit_type][self.system][unit]
    
    def get_available_units(self, unit_type: str) -> Dict[str, UnitConversion]:
        """Get all available units for a given type in the current system."""
        return self._conversions[unit_type][self.system]
    
    def get_preferred_unit(self, unit_type: str) -> str:
        """Get the preferred unit for display in the current system."""
        preferred_units = {
            "length": Units.MILLIMETER if self.system == "metric" else Units.INCH,
            "force": Units.KILONEWTON if self.system == "metric" else Units.KIP,
            "moment": Units.KILONEWTON_METER if self.system == "metric" else Units.KIP_FOOT,
            "stress": Units.GIGAPASCAL if self.system == "metric" else Units.KSI,
            "area": Units.SQUARE_MILLIMETER if self.system == "metric" else Units.SQUARE_INCH,
            "moment_of_inertia": Units.MILLIMETER_TO_FOURTH if self.system == "metric" else Units.INCH_TO_FOURTH,
            "acceleration": Units.METER_PER_SECOND_SQUARED if self.system == "metric" else Units.FOOT_PER_SECOND_SQUARED,
        }
        return preferred_units[unit_type]
    
    def convert_to_display(self, value: float, unit_type: str, from_unit: Optional[str] = None) -> tuple[float, str]:
        """Convert a value to the preferred display unit and return (value, unit_symbol)."""
        if from_unit is None:
            # Assume value is in base units (SI)
            from_unit = self._get_base_unit(unit_type)
        
        # Convert to base units first
        base_value = value * self.get_conversion(unit_type, from_unit).factor
        
        # Convert to preferred display unit
        preferred_unit = self.get_preferred_unit(unit_type)
        display_value = base_value / self.get_conversion(unit_type, preferred_unit).factor
        
        return display_value, self.get_conversion(unit_type, preferred_unit).symbol
    
    def convert_from_display(self, value: float, unit_type: str, to_unit: Optional[str] = None) -> float:
        """Convert a value from display units to base units (SI)."""
        if to_unit is None:
            to_unit = self._get_base_unit(unit_type)
        
        preferred_unit = self.get_preferred_unit(unit_type)
        
        # Convert from preferred unit to base units
        base_value = value * self.get_conversion(unit_type, preferred_unit).factor
        
        # Convert to target unit
        return base_value / self.get_conversion(unit_type, to_unit).factor
    
    def _get_base_unit(self, unit_type: str) -> str:
        """Get the base unit (SI) for a given unit type."""
        base_units = {
            "length": Units.METER,
            "force": Units.NEWTON,
            "moment": Units.NEWTON_METER,
            "stress": Units.PASCAL,
            "area": Units.SQUARE_METER,
            "moment_of_inertia": Units.METER_TO_FOURTH,
            "acceleration": Units.METER_PER_SECOND_SQUARED,
        }
        return base_units[unit_type]
    
    def format_value(self, value: float, unit_type: str, from_unit: Optional[str] = None) -> str:
        """Format a value with appropriate units for display."""
        display_value, unit_symbol = self.convert_to_display(value, unit_type, from_unit)
        conversion = self.get_conversion(unit_type, self.get_preferred_unit(unit_type))
        return f"{display_value:.{conversion.precision}f} {unit_symbol}"
    
    def parse_value(self, text: str, unit_type: str) -> float:
        """Parse a value with units from text input."""
        # Remove whitespace and split value and unit
        text = text.strip()
        
        # Find the unit symbol (try longest matches first)
        unit_symbol = None
        available_units = self.get_available_units(unit_type)
        
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
            # Convert from the specified unit to base units
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
def format_length(value: float, from_unit: Optional[str] = None) -> str:
    """Format a length value for display."""
    return _unit_manager.format_value(value, "length", from_unit)


def format_force(value: float, from_unit: Optional[str] = None) -> str:
    """Format a force value for display."""
    return _unit_manager.format_value(value, "force", from_unit)


def format_moment(value: float, from_unit: Optional[str] = None) -> str:
    """Format a moment value for display."""
    return _unit_manager.format_value(value, "moment", from_unit)


def format_stress(value: float, from_unit: Optional[str] = None) -> str:
    """Format a stress value for display."""
    return _unit_manager.format_value(value, "stress", from_unit)


def format_area(value: float, from_unit: Optional[str] = None) -> str:
    """Format an area value for display."""
    return _unit_manager.format_value(value, "area", from_unit)


def format_moment_of_inertia(value: float, from_unit: Optional[str] = None) -> str:
    """Format a moment of inertia value for display."""
    return _unit_manager.format_value(value, "moment_of_inertia", from_unit)


def format_acceleration(value: float, from_unit: Optional[str] = None) -> str:
    """Format an acceleration value for display."""
    return _unit_manager.format_value(value, "acceleration", from_unit)


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