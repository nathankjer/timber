"""
Unit system for timber structural analysis.

This module provides unit conversion utilities and unit-aware data structures
for handling metric and imperial units throughout the application.
All internal calculations are performed in SI units, with conversion only for display.
"""

from dataclasses import dataclass
from typing import Literal, Dict, Any, Optional
import math

# Unit system types
UnitSystem = Literal["metric", "imperial"]

# Unit types
class Units:
    """Unit constants for different physical quantities."""
    
    # SI Units (base units for all calculations)
    METER = "m"
    NEWTON = "N"
    NEWTON_METER = "N·m"
    PASCAL = "Pa"
    SQUARE_METER = "m²"
    METER_TO_FOURTH = "m⁴"
    METER_PER_SECOND_SQUARED = "m/s²"
    
    # Metric display units
    MILLIMETER = "mm"
    CENTIMETER = "cm"
    KILONEWTON = "kN"
    KILONEWTON_METER = "kN·m"
    MEGAPASCAL = "MPa"
    GIGAPASCAL = "GPa"
    SQUARE_MILLIMETER = "mm²"
    MILLIMETER_TO_FOURTH = "mm⁴"
    
    # Imperial display units
    FOOT = "ft"
    INCH = "in"
    POUND = "lb"
    KIP = "kip"
    POUND_FOOT = "lb·ft"
    KIP_FOOT = "kip·ft"
    PSI = "psi"
    KSI = "ksi"
    SQUARE_FOOT = "ft²"
    SQUARE_INCH = "in²"
    INCH_TO_FOURTH = "in⁴"
    POUND_FOOT_SECOND_SQUARED = "lb·ft²"
    FOOT_PER_SECOND_SQUARED = "ft/s²"


@dataclass
class UnitConversion:
    """Unit conversion factors and display information."""
    factor: float  # Conversion factor to SI base unit
    symbol: str    # Unit symbol for display
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
                Units.METER: UnitConversion(1.0, "m", 3),
                
                # Metric display units
                Units.MILLIMETER: UnitConversion(0.001, "mm", 3),
                Units.CENTIMETER: UnitConversion(0.01, "cm", 2),
                
                # Imperial display units
                Units.FOOT: UnitConversion(0.3048, "ft", 3),
                Units.INCH: UnitConversion(0.0254, "in", 2),
            },
            
            # Force conversions to newtons
            "force": {
                # SI base unit
                Units.NEWTON: UnitConversion(1.0, "N", 1),
                
                # Metric display units
                Units.KILONEWTON: UnitConversion(1000.0, "kN", 3),
                
                # Imperial display units
                Units.POUND: UnitConversion(4.44822, "lb", 3),
                Units.KIP: UnitConversion(4448.22, "kip", 3),
            },
            
            # Moment conversions to newton-meters
            "moment": {
                # SI base unit
                Units.NEWTON_METER: UnitConversion(1.0, "N·m", 1),
                
                # Metric display units
                Units.KILONEWTON_METER: UnitConversion(1000.0, "kN·m", 3),
                
                # Imperial display units
                Units.POUND_FOOT: UnitConversion(1.35582, "lb·ft", 3),
                Units.KIP_FOOT: UnitConversion(1355.82, "kip·ft", 3),
            },
            
            # Stress/modulus conversions to pascals
            "stress": {
                # SI base unit
                Units.PASCAL: UnitConversion(1.0, "Pa", 0),
                
                # Metric display units
                Units.MEGAPASCAL: UnitConversion(1e6, "MPa", 3),
                Units.GIGAPASCAL: UnitConversion(1e9, "GPa", 3),
                
                # Imperial display units
                Units.PSI: UnitConversion(6894.76, "psi", 0),
                Units.KSI: UnitConversion(6894760.0, "ksi", 3),
            },
            
            # Area conversions to square meters
            "area": {
                # SI base unit
                Units.SQUARE_METER: UnitConversion(1.0, "m²", 6),
                
                # Metric display units
                Units.SQUARE_MILLIMETER: UnitConversion(1e-6, "mm²", 3),
                
                # Imperial display units
                Units.SQUARE_FOOT: UnitConversion(0.092903, "ft²", 4),
                Units.SQUARE_INCH: UnitConversion(6.4516e-4, "in²", 4),
            },
            
            # Moment of inertia conversions to meter^4
            "moment_of_inertia": {
                # SI base unit
                Units.METER_TO_FOURTH: UnitConversion(1.0, "m⁴", 9),
                
                # Metric display units
                Units.MILLIMETER_TO_FOURTH: UnitConversion(1e-12, "mm⁴", 3),
                
                # Imperial display units
                Units.INCH_TO_FOURTH: UnitConversion(4.1623e-7, "in⁴", 6),
                Units.POUND_FOOT_SECOND_SQUARED: UnitConversion(0.0421401, "lb·ft²", 6),
            },
            
            # Acceleration conversions to m/s²
            "acceleration": {
                # SI base unit
                Units.METER_PER_SECOND_SQUARED: UnitConversion(1.0, "m/s²", 2),
                
                # Imperial display units
                Units.FOOT_PER_SECOND_SQUARED: UnitConversion(0.3048, "ft/s²", 2),
            }
        }
    
    def get_conversion(self, unit_type: str, unit: str) -> UnitConversion:
        """Get conversion information for a specific unit."""
        return self._conversions[unit_type][unit]
    
    def get_preferred_unit(self, unit_type: str) -> str:
        """Get the preferred unit for display in the current system."""
        preferred_units = {
            "length": Units.METER if self.system == "metric" else Units.FOOT,
            "force": Units.KILONEWTON if self.system == "metric" else Units.POUND,
            "moment": Units.KILONEWTON_METER if self.system == "metric" else Units.POUND_FOOT,
            "stress": Units.GIGAPASCAL if self.system == "metric" else Units.KSI,
            "area": Units.SQUARE_MILLIMETER if self.system == "metric" else Units.SQUARE_INCH,
            "moment_of_inertia": Units.MILLIMETER_TO_FOURTH if self.system == "metric" else Units.INCH_TO_FOURTH,
            "acceleration": Units.METER_PER_SECOND_SQUARED if self.system == "metric" else Units.FOOT_PER_SECOND_SQUARED,
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
    unit_types = ["length", "force", "moment", "stress", "area", "moment_of_inertia", "acceleration"]
    info = {}
    
    for unit_type in unit_types:
        preferred_unit = _unit_manager.get_preferred_unit(unit_type)
        conversion = _unit_manager.get_conversion(unit_type, preferred_unit)
        info[unit_type] = {
            "display_unit": preferred_unit,
            "symbol": conversion.symbol,
            "factor": conversion.factor,  # Factor to convert from SI to display
            "precision": conversion.precision
        }
    
    return info 